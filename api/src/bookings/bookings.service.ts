import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActorType,
  BookingSource,
  BookingStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AvailabilityService, BEDS_UNAVAILABLE_MESSAGE } from '../availability/availability.service';
import {
  formatIsoDate,
  parseIsoDate,
  validateStayDates,
} from '../common/utils/dates';
import { formatGuestName } from '../common/utils/guest-name';
import {
  calcDepositAmount,
  calcRemainingAfterTotalChange,
  calcTotalAmount,
  decimalToString,
  toDecimal,
} from '../common/utils/money';
import { isPaymentsEnabled } from '../common/utils/env-flag';
import { normalizePhoneE164 } from '../common/utils/phone';
import { generatePublicCode } from '../common/utils/public-code';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateManualBookingDto } from './dto/create-manual-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import {
  BOOKING_CREATED_EVENT,
  BOOKING_HOLD_EXPIRED_EVENT,
  BOOKING_STATUS_CHANGED_EVENT,
  BOOKING_UPDATED_EVENT,
  BookingFieldChange,
  BookingSnapshot,
} from './events/booking.events';
import {
  assertTransition,
  formatDebtUzs,
  isCheckOutBlockedByDebt,
  listAllowedTransitions,
  OCCUPYING_STATUSES,
  releasesInventory,
} from './status-machine';

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
    msg.includes('room_locks_no_overlap') ||
    msg.includes('23P01') ||
    msg.includes('exclusion') ||
    msg.includes('could not serialize')
  );
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly availability: AvailabilityService,
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
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
    const paymentsEnabled = isPaymentsEnabled(this.config);
    // Pre-requests get a longer hold so the operator can call the guest.
    const holdMs = paymentsEnabled
      ? Number(this.config.get('HOLD_MINUTES') ?? 30) * 60 * 1000
      : Number(this.config.get('REQUEST_HOLD_HOURS') ?? 6) * 60 * 60 * 1000;
    const source = paymentsEnabled
      ? BookingSource.online
      : BookingSource.online_request;

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

          const pricePerNight = room.category.pricePerBedPerNight;
          if (pricePerNight === null) {
            throw new BadRequestException(
              'Room has no price configured and cannot be booked',
            );
          }

          await this.availability.assertRoomAcceptsGuests(
            room.id,
            room.capacity,
            dto.guests,
            stay.checkIn,
            stay.checkOut,
            tx,
          );

          const totalAmount = calcTotalAmount(
            stay.nights,
            pricePerNight,
            dto.guests,
          );
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

          const expiresAt = new Date(Date.now() + holdMs);

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
                  bedsTotal: dto.guests,
                  priceOriginal: totalAmount,
                  totalAmount,
                  depositAmount,
                  paidAmount: new Decimal(0),
                  remainingAmount,
                  paymentStatus: PaymentStatus.unpaid,
                  status: BookingStatus.pending_payment,
                  source,
                  notes: dto.notes?.trim() || null,
                  expiresAt,
                  bookingRooms: {
                    create: {
                      roomId: room.id,
                      bedsBooked: dto.guests,
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
                  guests: dto.guests,
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

      this.events.emit(BOOKING_CREATED_EVENT, this.toSnapshot(booking));

      const view = this.toView(booking);

      if (!paymentsEnabled) {
        return {
          ...view,
          requiresOperator: true as const,
          paymentUrl: null,
          paymentId: null,
          paymentProvider: null,
          depositInvoiceAmount: null,
        };
      }

      const invoice = await this.payments.createInvoiceForBooking(
        booking.id,
        dto.provider,
      );

      return {
        ...view,
        requiresOperator: false as const,
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
        throw new ConflictException(BEDS_UNAVAILABLE_MESSAGE);
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
    paymentStatus?: PaymentStatus;
    search?: string;
    categoryId?: string;
    categoryCode?: string;
    cottageId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Prisma.BookingWhereInput = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
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

    const roomFilter: Prisma.RoomWhereInput = {};
    if (filters?.categoryId) {
      roomFilter.categoryId = filters.categoryId;
    }
    if (filters?.categoryCode) {
      roomFilter.category = { code: filters.categoryCode.toLowerCase() };
    }
    if (filters?.cottageId) {
      roomFilter.cottageId = filters.cottageId;
    }
    if (Object.keys(roomFilter).length > 0) {
      where.bookingRooms = { some: { room: roomFilter } };
    }

    if (filters?.dateFrom || filters?.dateTo) {
      const from = filters.dateFrom
        ? parseIsoDate(filters.dateFrom, 'dateFrom')
        : undefined;
      const to = filters.dateTo
        ? parseIsoDate(filters.dateTo, 'dateTo')
        : undefined;
      // Overlap with inclusive calendar range [from, to].
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        ...(to ? [{ checkIn: { lte: to } }] : []),
        ...(from ? [{ checkOut: { gt: from } }] : []),
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

  async createManual(
    dto: CreateManualBookingDto,
    actor: { type: ActorType; id: string },
  ) {
    let phone: string;
    try {
      phone = normalizePhoneE164(dto.phone);
    } catch {
      throw new BadRequestException(
        'phone must be a valid Uzbekistan number (+998…)',
      );
    }

    const stay = this.availability.validateQuery(dto.checkIn, dto.checkOut);

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM rooms WHERE id = ${dto.roomId}::uuid FOR UPDATE
          `;
          if (locked.length === 0) {
            throw new NotFoundException('Room not found');
          }

          const room = await tx.room.findUnique({
            where: { id: dto.roomId },
            include: { category: true, cottage: true },
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

          const pricePerNight = room.category.pricePerBedPerNight;
          if (pricePerNight === null) {
            throw new BadRequestException(
              'Room has no price configured and cannot be booked',
            );
          }

          await this.availability.assertRoomAcceptsGuests(
            room.id,
            room.capacity,
            dto.guests,
            stay.checkIn,
            stay.checkOut,
            tx,
          );

          const totalAmount = calcTotalAmount(
            stay.nights,
            pricePerNight,
            dto.guests,
          );
          const depositAmount = calcDepositAmount(
            totalAmount,
            room.category.depositPercent,
          );

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
                  bedsTotal: dto.guests,
                  priceOriginal: totalAmount,
                  totalAmount,
                  depositAmount,
                  paidAmount: new Decimal(0),
                  remainingAmount: totalAmount,
                  paymentStatus: PaymentStatus.unpaid,
                  status: BookingStatus.confirmed,
                  source: BookingSource.manual,
                  notes: dto.notes?.trim() || null,
                  expiresAt: null,
                  createdById: actor.id,
                  bookingRooms: {
                    create: {
                      roomId: room.id,
                      bedsBooked: dto.guests,
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
                const target =
                  (e.meta?.target as string[] | string | undefined) ?? [];
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
              actorType: actor.type,
              actorId: actor.id,
              entity: 'booking',
              entityId: created.id,
              action: 'create_manual',
              diff: {
                after: {
                  publicCode: created.publicCode,
                  roomId: room.id,
                  roomNumber: room.number,
                  checkIn: stay.checkInStr,
                  checkOut: stay.checkOutStr,
                  guests: dto.guests,
                  status: created.status,
                  totalAmount: decimalToString(totalAmount),
                  source: BookingSource.manual,
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

      this.events.emit(BOOKING_CREATED_EVENT, this.toSnapshot(booking));
      return this.toView(booking);
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
        throw new ConflictException(BEDS_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
  }

  async updateBooking(
    id: string,
    dto: UpdateBookingDto,
    actor: { type: ActorType; id: string },
  ) {
    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
          const booking = await tx.booking.findUnique({
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
          if (
            booking.status === BookingStatus.cancelled ||
            booking.status === BookingStatus.checked_out
          ) {
            throw new UnprocessableEntityException(
              `Cannot edit booking in status ${booking.status}`,
            );
          }

          const currentRoom = booking.bookingRooms[0];
          if (!currentRoom) {
            throw new BadRequestException('Booking has no rooms');
          }

          const before = {
            firstName: booking.customer.firstName,
            lastName: booking.customer.lastName,
            phone: booking.customer.phone,
            roomId: currentRoom.roomId,
            roomNumber: currentRoom.room.number,
            cottageName: currentRoom.room.cottage.name,
            category: currentRoom.room.category.name,
            checkIn: formatIsoDate(booking.checkIn),
            checkOut: formatIsoDate(booking.checkOut),
            notes: booking.notes ?? '',
            priceOriginal: decimalToString(booking.priceOriginal),
            totalAmount: decimalToString(booking.totalAmount),
            depositAmount: decimalToString(booking.depositAmount),
            paidAmount: decimalToString(booking.paidAmount),
            remainingAmount: decimalToString(booking.remainingAmount),
            bedsTotal: String(booking.bedsTotal),
            paymentStatus: booking.paymentStatus,
          };

          let phone = booking.customer.phone;
          if (dto.phone !== undefined) {
            try {
              phone = normalizePhoneE164(dto.phone);
            } catch {
              throw new BadRequestException(
                'phone must be a valid Uzbekistan number (+998…)',
              );
            }
          }

          const checkInStr = dto.checkIn ?? formatIsoDate(booking.checkIn);
          const checkOutStr = dto.checkOut ?? formatIsoDate(booking.checkOut);
          const stay = validateStayDates(checkInStr, checkOutStr, {
            minNights: Number(this.config.get('MIN_STAY_NIGHTS') ?? 1),
            maxNights: Number(this.config.get('MAX_STAY_NIGHTS') ?? 30),
            allowPast: true,
          });

          const roomId = dto.roomId ?? currentRoom.roomId;
          const guests = dto.guests ?? currentRoom.bedsBooked;

          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM rooms WHERE id = ${roomId}::uuid FOR UPDATE
          `;
          if (locked.length === 0) {
            throw new NotFoundException('Room not found');
          }

          const room = await tx.room.findUnique({
            where: { id: roomId },
            include: { category: true, cottage: true },
          });
          if (!room || !room.isActive || !room.cottage.isActive) {
            throw new BadRequestException('Room is not available for booking');
          }
          if (room.capacity < guests) {
            throw new BadRequestException(
              `Room capacity (${room.capacity}) is less than guests (${guests})`,
            );
          }

          const datesOrRoomChanged =
            roomId !== currentRoom.roomId ||
            stay.checkInStr !== before.checkIn ||
            stay.checkOutStr !== before.checkOut;
          const guestsChanged = guests !== currentRoom.bedsBooked;
          const inventoryChanged = datesOrRoomChanged || guestsChanged;

          if (
            inventoryChanged &&
            OCCUPYING_STATUSES.includes(booking.status)
          ) {
            await this.availability.assertRoomAcceptsGuests(
              room.id,
              room.capacity,
              guests,
              stay.checkIn,
              stay.checkOut,
              tx,
              { excludeBookingId: id },
            );
          }

          let priceOriginal = booking.priceOriginal;
          let totalAmount = booking.totalAmount;
          let depositAmount = booking.depositAmount;
          if (inventoryChanged) {
            const pricePerNight = room.category.pricePerBedPerNight;
            if (pricePerNight === null) {
              throw new BadRequestException(
                'Room has no price configured and cannot be booked',
              );
            }
            totalAmount = calcTotalAmount(
              stay.nights,
              pricePerNight,
              guests,
            );
            // Room/date/guests change resets catalog snapshot; deposit still recalculates
            // only here (not when admin bargains totalAmount alone).
            depositAmount = calcDepositAmount(
              totalAmount,
              room.category.depositPercent,
            );
            priceOriginal = totalAmount;
          }

          // Bargain: change total only — deposit & price_original stay fixed.
          if (dto.totalAmount !== undefined) {
            const bargained = toDecimal(dto.totalAmount);
            if (bargained.lte(0)) {
              throw new BadRequestException('totalAmount must be greater than 0');
            }
            totalAmount = bargained.toDecimalPlaces(2);
          }

          const paidAmount = booking.paidAmount;
          const remainingAmount = calcRemainingAfterTotalChange(
            totalAmount,
            paidAmount,
          );

          let paymentStatus = booking.paymentStatus;
          if (paidAmount.gte(totalAmount) && totalAmount.gt(0)) {
            paymentStatus = PaymentStatus.paid_full;
          } else if (paidAmount.gte(depositAmount) && paidAmount.gt(0)) {
            paymentStatus = PaymentStatus.deposit_paid;
          } else if (paidAmount.lte(0)) {
            paymentStatus = PaymentStatus.unpaid;
          }

          await tx.customer.update({
            where: { id: booking.customerId },
            data: {
              firstName: (dto.firstName ?? booking.customer.firstName).trim(),
              lastName: (dto.lastName ?? booking.customer.lastName).trim(),
              phone,
            },
          });

          if (inventoryChanged) {
            // Replace room assignment in-place to keep one active row
            await tx.bookingRoom.updateMany({
              where: { bookingId: id },
              data: { isActive: false },
            });
            await tx.bookingRoom.deleteMany({ where: { bookingId: id } });
            await tx.bookingRoom.create({
              data: {
                bookingId: id,
                roomId: room.id,
                bedsBooked: guests,
                checkIn: stay.checkIn,
                checkOut: stay.checkOut,
                isActive: OCCUPYING_STATUSES.includes(booking.status),
              },
            });
          }

          const after = await tx.booking.update({
            where: { id },
            data: {
              checkIn: stay.checkIn,
              checkOut: stay.checkOut,
              bedsTotal: guests,
              priceOriginal,
              totalAmount,
              depositAmount,
              remainingAmount,
              paymentStatus,
              ...(dto.notes !== undefined
                ? { notes: dto.notes.trim() || null }
                : {}),
            },
            include: {
              customer: true,
              bookingRooms: {
                include: {
                  room: { include: { cottage: true, category: true } },
                },
              },
            },
          });

          const afterDiff = {
            firstName: after.customer.firstName,
            lastName: after.customer.lastName,
            phone: after.customer.phone,
            roomId: room.id,
            roomNumber: room.number,
            cottageName: room.cottage.name,
            category: room.category.name,
            checkIn: stay.checkInStr,
            checkOut: stay.checkOutStr,
            notes: after.notes ?? '',
            priceOriginal: decimalToString(priceOriginal),
            totalAmount: decimalToString(totalAmount),
            depositAmount: decimalToString(depositAmount),
            paidAmount: decimalToString(paidAmount),
            remainingAmount: decimalToString(remainingAmount),
            bedsTotal: String(after.bedsTotal),
            paymentStatus: after.paymentStatus,
          };

          await tx.auditLog.create({
            data: {
              actorType: actor.type,
              actorId: actor.id,
              entity: 'booking',
              entityId: id,
              action: 'update',
              diff: {
                before,
                after: afterDiff,
              },
            },
          });

          return { booking: after, before, after: afterDiff };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );

      const changes = this.diffBookingFields(updated.before, updated.after);
      if (changes.length > 0) {
        this.events.emit(BOOKING_UPDATED_EVENT, {
          bookingId: updated.booking.id,
          publicCode: updated.booking.publicCode,
          changes,
        });
      }

      return this.toView(updated.booking);
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
        throw new ConflictException(BEDS_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
  }

  async getCalendar(fromStr: string, toStr: string) {
    const from = parseIsoDate(fromStr, 'from');
    const to = parseIsoDate(toStr, 'to');
    if (!(from.getTime() < to.getTime())) {
      throw new BadRequestException('from must be before to');
    }
    const maxDays = 62;
    const days = Math.round(
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (days > maxDays) {
      throw new BadRequestException(`Calendar range must be ≤ ${maxDays} days`);
    }

    const rooms = await this.prisma.room.findMany({
      where: { isActive: true },
      include: { cottage: true, category: true },
      orderBy: [{ cottage: { sortOrder: 'asc' } }, { number: 'asc' }],
    });

    const [bookings, locks] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          checkIn: { lt: to },
          checkOut: { gt: from },
          status: { not: BookingStatus.cancelled },
        },
        include: {
          customer: true,
          bookingRooms: {
            where: { isActive: true },
            include: { room: true },
          },
        },
      }),
      this.prisma.roomLock.findMany({
        where: {
          checkIn: { lt: to },
          checkOut: { gt: from },
        },
        include: { room: true },
        orderBy: { checkIn: 'asc' },
      }),
    ]);

    const bars: Array<{
      bookingId: string;
      publicCode: string;
      status: BookingStatus;
      paymentStatus: PaymentStatus;
      checkIn: string;
      checkOut: string;
      customerName: string;
      roomId: string;
      roomNumber: string;
      bedsBooked: number;
    }> = [];

    for (const b of bookings) {
      for (const br of b.bookingRooms) {
        bars.push({
          bookingId: b.id,
          publicCode: b.publicCode,
          status: b.status,
          paymentStatus: b.paymentStatus,
          checkIn: formatIsoDate(br.checkIn),
          checkOut: formatIsoDate(br.checkOut),
          customerName: formatGuestName(
            b.customer.firstName,
            b.customer.lastName,
          ),
          roomId: br.roomId,
          roomNumber: br.room.number,
          bedsBooked: br.bedsBooked,
        });
      }
    }

    return {
      from: formatIsoDate(from),
      to: formatIsoDate(to),
      rooms: rooms.map((r) => ({
        id: r.id,
        number: r.number,
        capacity: r.capacity,
        cottageId: r.cottageId,
        cottageName: r.cottage.name,
        categoryCode: r.category.code,
      })),
      bookings: bars,
      locks: locks.map((lock) => ({
        id: lock.id,
        roomId: lock.roomId,
        roomNumber: lock.room.number,
        bookingId: lock.bookingId,
        checkIn: formatIsoDate(lock.checkIn),
        checkOut: formatIsoDate(lock.checkOut),
        reason: lock.reason,
      })),
    };
  }

  async transitionStatus(
    id: string,
    next: BookingStatus,
    actor?: { type: ActorType; id?: string },
  ) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id },
          include: { bookingRooms: true },
        });
        if (!booking) {
          throw new NotFoundException('Booking not found');
        }

        const previousStatus = booking.status;

        try {
          assertTransition(booking.status, next);
        } catch {
          throw new UnprocessableEntityException(
            `Illegal status transition: ${booking.status} → ${next}`,
          );
        }

        if (isCheckOutBlockedByDebt(next, booking.remainingAmount)) {
          throw new UnprocessableEntityException(
            `Нельзя выселить: задолженность ${formatDebtUzs(
              booking.remainingAmount,
            )}. Сначала отметьте оплату остатка.`,
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
              before: { status: previousStatus },
              after: { status: next },
            },
          },
        });

        return { after, previousStatus };
      });

      this.events.emit(BOOKING_STATUS_CHANGED_EVENT, {
        booking: this.toSnapshot(result.after),
        previousStatus: result.previousStatus,
        nextStatus: next,
      });

      return this.toView(result.after);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      if (isExclusionOrConflict(error)) {
        throw new ConflictException(BEDS_UNAVAILABLE_MESSAGE);
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
      const cancelledId = await this.prisma.$transaction(async (tx) => {
        const current = await tx.booking.findUnique({ where: { id: row.id } });
        if (
          !current ||
          current.status !== BookingStatus.pending_payment ||
          !current.expiresAt ||
          current.expiresAt >= new Date()
        ) {
          return null;
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
        return row.id;
      });

      if (!cancelledId) {
        continue;
      }
      count += 1;

      const booking = await this.prisma.booking.findUnique({
        where: { id: cancelledId },
        include: {
          customer: true,
          bookingRooms: {
            include: {
              room: { include: { cottage: true, category: true } },
            },
          },
        },
      });
      if (booking) {
        this.events.emit(
          BOOKING_HOLD_EXPIRED_EVENT,
          this.toSnapshot(booking),
        );
      }
    }
    return count;
  }

  private toSnapshot(
    booking: Parameters<BookingsService['toView']>[0],
  ): BookingSnapshot {
    return {
      bookingId: booking.id,
      publicCode: booking.publicCode,
      firstName: booking.customer.firstName,
      lastName: booking.customer.lastName,
      phone: booking.customer.phone,
      rooms: booking.bookingRooms.map((br) => ({
        number: br.room.number,
        cottageName: br.room.cottage.name,
        categoryCode: br.room.category.code,
        categoryName: br.room.category.name,
        capacity: br.room.capacity,
        bedsBooked: br.bedsBooked,
      })),
      bedsTotal: booking.bedsTotal,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      priceOriginal: decimalToString(booking.priceOriginal),
      totalAmount: decimalToString(booking.totalAmount),
      depositAmount: decimalToString(booking.depositAmount),
      paidAmount: decimalToString(booking.paidAmount),
      remainingAmount: decimalToString(booking.remainingAmount),
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      source: booking.source,
      notes: booking.notes,
    };
  }

  private diffBookingFields(
    before: Record<string, string>,
    after: Record<string, string>,
  ): BookingFieldChange[] {
    const skip = new Set(['roomId']);
    const changes: BookingFieldChange[] = [];
    for (const key of Object.keys(after)) {
      if (skip.has(key)) {
        continue;
      }
      const from = before[key] ?? '';
      const to = after[key] ?? '';
      if (from !== to) {
        changes.push({ field: key, from, to });
      }
    }
    return changes;
  }

  private toView(
    booking: {
      id: string;
      publicCode: string;
      checkIn: Date;
      checkOut: Date;
      bedsTotal: number;
      priceOriginal: Decimal;
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
      priceOriginal: decimalToString(booking.priceOriginal),
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
      allowedTransitions: listAllowedTransitions(booking.status),
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
        cottageId: br.room.cottage.id,
        cottageName: br.room.cottage.name,
        categoryCode: br.room.category.code,
        isActive: br.isActive,
      })),
    };
  }
}
