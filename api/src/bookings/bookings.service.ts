import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  BookingSource,
  BookingStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AvailabilityService } from '../availability/availability.service';
import {
  calcDepositAmount,
  calcTotalAmount,
  decimalToString,
} from '../common/utils/money';
import { normalizePhoneE164 } from '../common/utils/phone';
import { generatePublicCode } from '../common/utils/public-code';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  assertTransition,
  releasesInventory,
} from './status-machine';

const ROOM_TAKEN_MESSAGE =
  'This room was just booked, please pick another room or dates';

function isExclusionOrConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' || error.code === 'P2034') {
      return true;
    }
  }
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return (
    msg.includes('booking_rooms_no_overlap') ||
    msg.includes('23P01') ||
    msg.includes('exclusion')
  );
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly availability: AvailabilityService,
    private readonly payments: PaymentsService,
  ) {}

  async createPublic(dto: CreateBookingDto) {
    let phone: string;
    try {
      phone = normalizePhoneE164(dto.phone);
    } catch {
      throw new BadRequestException(
        'phone must be a valid Uzbekistan number (+998…)',
      );
    }

    const stay = this.availability.validateQuery(dto.checkIn, dto.checkOut);
    const holdMinutes = Number(this.config.get('HOLD_MINUTES') ?? 30);

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          // Lock the physical room row
          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM rooms WHERE id = ${dto.roomId}::uuid FOR UPDATE
          `;
          if (locked.length === 0) {
            throw new NotFoundException('Room not found');
          }

          const room = await tx.room.findUnique({
            where: { id: dto.roomId },
            include: {
              category: true,
              cottage: true,
            },
          });
          if (!room || !room.isActive || !room.cottage.isActive) {
            throw new BadRequestException('Room is not available for booking');
          }
          if (!room.category.isActive) {
            throw new BadRequestException('Category is not available');
          }
          if (room.capacity < dto.guests) {
            throw new BadRequestException(
              `Room capacity (${room.capacity}) is less than guests (${dto.guests})`,
            );
          }

          const tier = await tx.priceTier.findUnique({
            where: {
              categoryId_capacity: {
                categoryId: room.categoryId,
                capacity: room.capacity,
              },
            },
          });
          const pricePerNight = room.priceOverride ?? tier?.pricePerNight ?? null;
          if (pricePerNight === null) {
            throw new BadRequestException(
              'Room has no price configured and cannot be booked',
            );
          }

          const occupied = await this.availability.findOccupiedRoomIds(
            stay.checkIn,
            stay.checkOut,
            tx,
          );
          if (!this.availability.isRoomFree(room.id, occupied)) {
            throw new ConflictException(ROOM_TAKEN_MESSAGE);
          }

          const totalAmount = calcTotalAmount(stay.nights, pricePerNight);
          const depositAmount = calcDepositAmount(
            totalAmount,
            room.category.depositPercent,
          );
          const remainingAmount = totalAmount.sub(depositAmount);

          let customer = await tx.customer.findFirst({ where: { phone } });
          if (customer) {
            customer = await tx.customer.update({
              where: { id: customer.id },
              data: {
                firstName: dto.firstName.trim(),
                lastName: dto.lastName.trim(),
              },
            });
          } else {
            customer = await tx.customer.create({
              data: {
                firstName: dto.firstName.trim(),
                lastName: dto.lastName.trim(),
                phone,
              },
            });
          }

          const expiresAt = new Date(
            Date.now() + holdMinutes * 60 * 1000,
          );

          let created = null as Awaited<
            ReturnType<typeof tx.booking.create>
          > | null;
          for (let attempt = 0; attempt < 5; attempt++) {
            const publicCode = generatePublicCode();
            try {
              created = await tx.booking.create({
                data: {
                  publicCode,
                  customerId: customer.id,
                  checkIn: stay.checkIn,
                  checkOut: stay.checkOut,
                  bedsTotal: room.capacity,
                  totalAmount,
                  depositAmount,
                  paidAmount: new Decimal(0),
                  remainingAmount,
                  paymentStatus: PaymentStatus.unpaid,
                  status: BookingStatus.pending_payment,
                  source: BookingSource.online,
                  notes: dto.notes?.trim() || null,
                  expiresAt,
                  bookingRooms: {
                    create: {
                      roomId: room.id,
                      bedsBooked: room.capacity,
                      checkIn: stay.checkIn,
                      checkOut: stay.checkOut,
                      isActive: true,
                    },
                  },
                },
              });
              break;
            } catch (e) {
              if (
                e instanceof Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2002'
              ) {
                const target = (e.meta?.target as string[] | string | undefined) ?? [];
                const targetStr = Array.isArray(target)
                  ? target.join(',')
                  : String(target);
                if (targetStr.includes('public_code')) {
                  continue;
                }
              }
              throw e;
            }
          }
          if (!created) {
            throw new ConflictException(
              'Could not allocate a unique booking code, please retry',
            );
          }

          await tx.auditLog.create({
            data: {
              actorType: ActorType.customer,
              actorId: customer.id,
              entity: 'booking',
              entityId: created.id,
              action: 'create',
              diff: {
                after: {
                  publicCode: created.publicCode,
                  roomId: room.id,
                  roomNumber: room.number,
                  checkIn: stay.checkInStr,
                  checkOut: stay.checkOutStr,
                  status: created.status,
                  totalAmount: decimalToString(totalAmount),
                  depositAmount: decimalToString(depositAmount),
                },
              },
            },
          });

          return tx.booking.findUniqueOrThrow({
            where: { id: created.id },
            include: {
              customer: true,
              bookingRooms: {
                include: {
                  room: {
                    include: { cottage: true, category: true },
                  },
                },
              },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );

      const view = this.toView(booking);
      const invoice = await this.payments.createInvoiceForBooking(
        booking.id,
        dto.provider,
      );

      return {
        ...view,
        paymentUrl: invoice.paymentUrl,
        paymentId: invoice.paymentId,
        paymentProvider: invoice.provider,
        depositInvoiceAmount: invoice.amount,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      if (isExclusionOrConflict(error)) {
        throw new ConflictException(ROOM_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  async getById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        customer: true,
        bookingRooms: {
          include: {
            room: { include: { cottage: true, category: true } },
          },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return this.toView(booking);
  }

  async getByPublicCode(publicCode: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { publicCode },
      include: {
        customer: true,
        bookingRooms: {
          include: {
            room: { include: { cottage: true, category: true } },
          },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return this.toView(booking);
  }

  async listAdmin(filters?: {
    status?: BookingStatus;
    search?: string;
  }) {
    const where: Prisma.BookingWhereInput = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.search) {
      const q = filters.search.trim();
      where.OR = [
        { publicCode: { contains: q, mode: 'insensitive' } },
        { customer: { phone: { contains: q } } },
        { customer: { firstName: { contains: q, mode: 'insensitive' } } },
        { customer: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.booking.findMany({
      where,
      include: {
        customer: true,
        bookingRooms: {
          include: {
            room: { include: { cottage: true, category: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((b) => this.toView(b));
  }

  async transitionStatus(
    id: string,
    next: BookingStatus,
    actor?: { type: ActorType; id?: string },
  ) {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id },
          include: { bookingRooms: true },
        });
        if (!booking) {
          throw new NotFoundException('Booking not found');
        }

        try {
          assertTransition(booking.status, next);
        } catch {
          throw new UnprocessableEntityException(
            `Illegal status transition: ${booking.status} → ${next}`,
          );
        }

        const data: Prisma.BookingUpdateInput = { status: next };

        if (next === BookingStatus.deposit_paid) {
          data.paymentStatus = PaymentStatus.deposit_paid;
          if (booking.paidAmount.lt(booking.depositAmount)) {
            data.paidAmount = booking.depositAmount;
            data.remainingAmount = booking.totalAmount.sub(
              booking.depositAmount,
            );
          }
        }

        if (releasesInventory(next)) {
          await tx.bookingRoom.updateMany({
            where: { bookingId: id },
            data: { isActive: false },
          });
        }

        const after = await tx.booking.update({
          where: { id },
          data,
          include: {
            customer: true,
            bookingRooms: {
              include: {
                room: { include: { cottage: true, category: true } },
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: actor?.type ?? ActorType.system,
            actorId: actor?.id ?? null,
            entity: 'booking',
            entityId: id,
            action: 'status_change',
            diff: {
              before: { status: booking.status },
              after: { status: next },
            },
          },
        });

        return after;
      });

      return this.toView(updated);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      if (isExclusionOrConflict(error)) {
        throw new ConflictException(ROOM_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  /** Cancel expired pending_payment holds and free inventory. */
  async expireHolds(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.pending_payment,
        expiresAt: { lt: now },
      },
      select: { id: true },
    });

    let count = 0;
    for (const row of expired) {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.booking.findUnique({ where: { id: row.id } });
        if (
          !current ||
          current.status !== BookingStatus.pending_payment ||
          !current.expiresAt ||
          current.expiresAt >= new Date()
        ) {
          return;
        }

        await tx.booking.update({
          where: { id: row.id },
          data: { status: BookingStatus.cancelled },
        });
        await tx.bookingRoom.updateMany({
          where: { bookingId: row.id },
          data: { isActive: false },
        });
        await tx.auditLog.create({
          data: {
            actorType: ActorType.system,
            actorId: null,
            entity: 'booking',
            entityId: row.id,
            action: 'expire_hold',
            diff: {
              before: { status: BookingStatus.pending_payment },
              after: { status: BookingStatus.cancelled },
            },
          },
        });
        count += 1;
      });
    }
    return count;
  }

  private toView(
    booking: {
      id: string;
      publicCode: string;
      checkIn: Date;
      checkOut: Date;
      bedsTotal: number;
      totalAmount: Decimal;
      depositAmount: Decimal;
      paidAmount: Decimal;
      remainingAmount: Decimal;
      paymentStatus: PaymentStatus;
      status: BookingStatus;
      source: BookingSource;
      notes: string | null;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      customer: {
        id: string;
        firstName: string;
        lastName: string;
        phone: string;
      };
      bookingRooms: Array<{
        id: string;
        bedsBooked: number;
        checkIn: Date;
        checkOut: Date;
        isActive: boolean;
        room: {
          id: string;
          number: string;
          capacity: number;
          cottage: { id: string; name: string };
          category: { id: string; code: string; name: string };
        };
      }>;
    },
  ) {
    return {
      id: booking.id,
      publicCode: booking.publicCode,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      bedsTotal: booking.bedsTotal,
      totalAmount: decimalToString(booking.totalAmount),
      depositAmount: decimalToString(booking.depositAmount),
      paidAmount: decimalToString(booking.paidAmount),
      remainingAmount: decimalToString(booking.remainingAmount),
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      source: booking.source,
      notes: booking.notes,
      expiresAt: booking.expiresAt,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      customer: {
        id: booking.customer.id,
        firstName: booking.customer.firstName,
        lastName: booking.customer.lastName,
        phone: booking.customer.phone,
      },
      rooms: booking.bookingRooms.map((br) => ({
        bookingRoomId: br.id,
        roomId: br.room.id,
        number: br.room.number,
        capacity: br.room.capacity,
        bedsBooked: br.bedsBooked,
        cottageName: br.room.cottage.name,
        categoryCode: br.room.category.code,
        isActive: br.isActive,
      })),
    };
  }
}
