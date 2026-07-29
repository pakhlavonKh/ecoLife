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
import { validateStayDates, nightsBetween } from '../common/utils/dates';
import {
  addLocalDays,
  formatLocalDate,
  formatLocalTime,
  MS_PER_DAY,
  parseLocalDateTime,
} from '../common/utils/datetime';
import { formatGuestName } from '../common/utils/guest-name';
import {
  calcDepositAmount,
  calcNightlySubtotal,
  calcRemainingAfterTotalChange,
  calcTotalAmount,
  decimalToString,
  formatPriceBreakdownParts,
  toDecimal,
} from '../common/utils/money';
import {
  assertValidGuestCounts,
  occupyingBeds,
  type GuestCounts,
} from '../common/utils/guest-counts';
import { isPaymentsEnabled } from '../common/utils/env-flag';
import { normalizePhoneE164 } from '../common/utils/phone';
import { generatePublicCode } from '../common/utils/public-code';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateManualBookingDto } from './dto/create-manual-booking.dto';
import { ExtendBookingDto } from './dto/extend-booking.dto';
import { TransferBookingDto } from './dto/transfer-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import {
  BOOKING_CREATED_EVENT,
  BOOKING_HOLD_EXPIRED_EVENT,
  BOOKING_STATUS_CHANGED_EVENT,
  BOOKING_TRANSFERRED_EVENT,
  BOOKING_UPDATED_EVENT,
  BookingFieldChange,
  BookingSnapshot,
  BookingTransferredPayload,
  PriceBreakdown,
} from './events/booking.events';
import {
  assertTransition,
  formatDebtUzs,
  isCheckOutBlockedByDebt,
  listAllowedTransitions,
  OCCUPYING_STATUSES,
  releasesInventory,
} from './status-machine';
import {
  buildPriceBreakdown,
  calcExtendMoney,
  calcTransferMoney,
  formatTransferAt,
  splitStayAtTransfer,
} from './transfer-math';

function guestCountsFromDto(dto: {
  adults: number;
  children?: number;
  infants?: number;
}): GuestCounts {
  const counts: GuestCounts = {
    adults: dto.adults,
    children: dto.children ?? 0,
    infants: dto.infants ?? 0,
  };
  try {
    assertValidGuestCounts(counts);
  } catch (e) {
    throw new BadRequestException(
      e instanceof Error ? e.message : 'Invalid guest counts',
    );
  }
  return counts;
}

function categoryPrices(category: {
  priceAdult: Decimal;
  priceChild: Decimal;
  priceInfant: Decimal;
}) {
  return {
    priceAdult: category.priceAdult,
    priceChild: category.priceChild,
    priceInfant: category.priceInfant,
  };
}

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

    const stay = this.availability.validateQuery(dto.checkIn, dto.checkOut, {
      checkInTime: dto.checkInTime,
      checkOutTime: dto.checkOutTime,
    });
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
          const counts = guestCountsFromDto(dto);
          const beds = occupyingBeds(counts);

          if (room.capacity < beds) {
            throw new BadRequestException(
              `Room capacity (${room.capacity}) is less than occupying guests (${beds}; infants excluded)`,
            );
          }

          const prices = categoryPrices(room.category);

          await this.availability.assertRoomAcceptsGuests(
            room.id,
            room.capacity,
            beds,
            stay.checkIn,
            stay.checkOut,
            tx,
          );

          const totalAmount = calcTotalAmount(stay.nights, counts, prices);
          const depositAmount = calcDepositAmount(
            totalAmount,
            room.category.depositPercent,
          );
          const remainingAmount = totalAmount.sub(depositAmount);
          const priceBreakdown = formatPriceBreakdownParts(
            counts,
            prices,
            stay.nights,
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
                  bedsTotal: beds,
                  adults: counts.adults,
                  children: counts.children,
                  infants: counts.infants,
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
                      bedsBooked: beds,
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
                  adults: counts.adults,
                  children: counts.children,
                  infants: counts.infants,
                  bedsTotal: beds,
                  status: created.status,
                  totalAmount: decimalToString(totalAmount),
                  depositAmount: decimalToString(depositAmount),
                  priceBreakdown,
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
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    const view = this.toView(booking);
    const recordedByIds = new Set<string>();
    for (const p of booking.payments) {
      const payload = p.payload as { recordedBy?: unknown } | null;
      if (typeof payload?.recordedBy === 'string' && payload.recordedBy) {
        recordedByIds.add(payload.recordedBy);
      }
    }
    const users =
      recordedByIds.size > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: [...recordedByIds] } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return {
      ...view,
      payments: booking.payments.map((p) => {
        const payload = p.payload as { recordedBy?: unknown } | null;
        const recordedById =
          typeof payload?.recordedBy === 'string' ? payload.recordedBy : null;
        return {
          id: p.id,
          provider: p.provider,
          amount: decimalToString(p.amount),
          status: p.status,
          currency: p.currency,
          createdAt: p.createdAt.toISOString(),
          recordedById,
          recordedByName: recordedById
            ? (nameById.get(recordedById) ?? null)
            : null,
        };
      }),
    };
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
        ? parseLocalDateTime(filters.dateFrom, undefined, 'dateFrom')
        : undefined;
      // Inclusive calendar range [from, to] → exclusive instant after the `to` day.
      const toExclusive = filters.dateTo
        ? addLocalDays(parseLocalDateTime(filters.dateTo, undefined, 'dateTo'), 1)
        : undefined;
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        ...(toExclusive ? [{ checkIn: { lt: toExclusive } }] : []),
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

    const stay = this.availability.validateQuery(dto.checkIn, dto.checkOut, {
      checkInTime: dto.checkInTime,
      checkOutTime: dto.checkOutTime,
    });

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
          const counts = guestCountsFromDto(dto);
          const beds = occupyingBeds(counts);

          if (room.capacity < beds) {
            throw new BadRequestException(
              `Room capacity (${room.capacity}) is less than occupying guests (${beds}; infants excluded)`,
            );
          }

          const prices = categoryPrices(room.category);

          await this.availability.assertRoomAcceptsGuests(
            room.id,
            room.capacity,
            beds,
            stay.checkIn,
            stay.checkOut,
            tx,
          );

          const totalAmount = calcTotalAmount(stay.nights, counts, prices);
          const depositAmount = calcDepositAmount(
            totalAmount,
            room.category.depositPercent,
          );
          const priceBreakdown = formatPriceBreakdownParts(
            counts,
            prices,
            stay.nights,
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
                  bedsTotal: beds,
                  adults: counts.adults,
                  children: counts.children,
                  infants: counts.infants,
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
                      bedsBooked: beds,
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
                  adults: counts.adults,
                  children: counts.children,
                  infants: counts.infants,
                  bedsTotal: beds,
                  status: created.status,
                  totalAmount: decimalToString(totalAmount),
                  source: BookingSource.manual,
                  priceBreakdown,
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

          const activeSegments = booking.bookingRooms
            .filter((br) => br.isActive)
            .sort((a, b) => a.segmentIndex - b.segmentIndex);
          const currentRoom =
            activeSegments[activeSegments.length - 1] ??
            booking.bookingRooms[0];
          if (!currentRoom) {
            throw new BadRequestException('Booking has no rooms');
          }
          if (activeSegments.length > 1) {
            const inventoryTouched =
              dto.roomId !== undefined ||
              dto.checkIn !== undefined ||
              dto.checkOut !== undefined ||
              dto.checkInTime !== undefined ||
              dto.checkOutTime !== undefined ||
              dto.adults !== undefined ||
              dto.children !== undefined ||
              dto.infants !== undefined;
            if (inventoryTouched) {
              throw new UnprocessableEntityException(
                'Multi-segment booking: use transfer/extend instead of direct room/date edit',
              );
            }
          }

          const before = {
            firstName: booking.customer.firstName,
            lastName: booking.customer.lastName,
            phone: booking.customer.phone,
            roomId: currentRoom.roomId,
            roomNumber: currentRoom.room.number,
            cottageName: currentRoom.room.cottage.name,
            category: currentRoom.room.category.name,
            checkIn: formatLocalDate(booking.checkIn),
            checkOut: formatLocalDate(booking.checkOut),
            checkInTime: formatLocalTime(booking.checkIn),
            checkOutTime: formatLocalTime(booking.checkOut),
            notes: booking.notes ?? '',
            priceOriginal: decimalToString(booking.priceOriginal),
            totalAmount: decimalToString(booking.totalAmount),
            depositAmount: decimalToString(booking.depositAmount),
            paidAmount: decimalToString(booking.paidAmount),
            remainingAmount: decimalToString(booking.remainingAmount),
            bedsTotal: String(booking.bedsTotal),
            adults: String(booking.adults),
            children: String(booking.children),
            infants: String(booking.infants),
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

          const checkInStr = dto.checkIn ?? before.checkIn;
          const checkOutStr = dto.checkOut ?? before.checkOut;
          // Keep existing times unless the admin explicitly sends new ones.
          const stay = validateStayDates(checkInStr, checkOutStr, {
            minNights: Number(this.config.get('MIN_STAY_NIGHTS') ?? 1),
            maxNights: Number(this.config.get('MAX_STAY_NIGHTS') ?? 30),
            allowPast: true,
            checkInTime: dto.checkInTime ?? before.checkInTime,
            checkOutTime: dto.checkOutTime ?? before.checkOutTime,
          });

          const roomId = dto.roomId ?? currentRoom.roomId;
          const counts = guestCountsFromDto({
            adults: dto.adults ?? booking.adults,
            children: dto.children ?? booking.children,
            infants: dto.infants ?? booking.infants,
          });
          const beds = occupyingBeds(counts);

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
          if (room.capacity < beds) {
            throw new BadRequestException(
              `Room capacity (${room.capacity}) is less than occupying guests (${beds}; infants excluded)`,
            );
          }

          const stayOrRoomChanged =
            roomId !== currentRoom.roomId ||
            stay.checkInStr !== before.checkIn ||
            stay.checkOutStr !== before.checkOut ||
            stay.checkInTime !== before.checkInTime ||
            stay.checkOutTime !== before.checkOutTime;
          const guestsChanged =
            counts.adults !== booking.adults ||
            counts.children !== booking.children ||
            counts.infants !== booking.infants ||
            beds !== currentRoom.bedsBooked;
          const inventoryChanged = stayOrRoomChanged || guestsChanged;

          if (
            inventoryChanged &&
            OCCUPYING_STATUSES.includes(booking.status)
          ) {
            await this.availability.assertRoomAcceptsGuests(
              room.id,
              room.capacity,
              beds,
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
            const prices = categoryPrices(room.category);
            totalAmount = calcTotalAmount(stay.nights, counts, prices);
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
                bedsBooked: beds,
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
              bedsTotal: beds,
              adults: counts.adults,
              children: counts.children,
              infants: counts.infants,
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
            checkInTime: stay.checkInTime,
            checkOutTime: stay.checkOutTime,
            notes: after.notes ?? '',
            priceOriginal: decimalToString(priceOriginal),
            totalAmount: decimalToString(totalAmount),
            depositAmount: decimalToString(depositAmount),
            paidAmount: decimalToString(paidAmount),
            remainingAmount: decimalToString(remainingAmount),
            bedsTotal: String(after.bedsTotal),
            adults: String(after.adults),
            children: String(after.children),
            infants: String(after.infants),
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
    const from = parseLocalDateTime(fromStr, undefined, 'from');
    const to = parseLocalDateTime(toStr, undefined, 'to');
    if (!(from.getTime() < to.getTime())) {
      throw new BadRequestException('from must be before to');
    }
    const maxDays = 62;
    const days = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
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
      checkInTime: string;
      checkOutTime: string;
      checkInAt: string;
      checkOutAt: string;
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
          checkIn: formatLocalDate(br.checkIn),
          checkOut: formatLocalDate(br.checkOut),
          checkInTime: formatLocalTime(br.checkIn),
          checkOutTime: formatLocalTime(br.checkOut),
          checkInAt: br.checkIn.toISOString(),
          checkOutAt: br.checkOut.toISOString(),
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
      from: formatLocalDate(from),
      to: formatLocalDate(to),
      cleaningBufferMinutes: this.availability.cleaningBufferMinutes,
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
        checkIn: formatLocalDate(lock.checkIn),
        checkOut: formatLocalDate(lock.checkOut),
        checkInTime: formatLocalTime(lock.checkIn),
        checkOutTime: formatLocalTime(lock.checkOut),
        checkInAt: lock.checkIn.toISOString(),
        checkOutAt: lock.checkOut.toISOString(),
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

  /**
   * Transfer / upgrade (TRANSFER.md §2–5): split stay at transferAt, free old
   * beds from that instant (no cleaning buffer) and occupy the new room — one
   * transaction through the availability engine (self-exclusion). Same category
   * → no surcharge; different category → editable surcharge via age pricing.
   */
  async transferBooking(
    id: string,
    dto: TransferBookingDto,
    actor: { type: ActorType; id: string },
  ) {
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const booking = await tx.booking.findUnique({
            where: { id },
            include: {
              customer: true,
              bookingRooms: {
                include: {
                  room: { include: { cottage: true, category: true } },
                },
                orderBy: { segmentIndex: 'asc' },
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
              `Cannot transfer booking in status ${booking.status}`,
            );
          }
          if (!OCCUPYING_STATUSES.includes(booking.status)) {
            throw new UnprocessableEntityException(
              `Cannot transfer booking in status ${booking.status}`,
            );
          }

          const activeSegments = booking.bookingRooms.filter((br) => br.isActive);
          if (activeSegments.length === 0) {
            throw new BadRequestException('Booking has no active room segments');
          }

          const transferTime =
            dto.transferTime ??
            formatLocalTime(
              activeSegments[activeSegments.length - 1]!.checkIn,
            );
          const transferAt = parseLocalDateTime(
            dto.transferDate,
            transferTime,
            'transferDate',
          );

          if (
            transferAt.getTime() < booking.checkIn.getTime() ||
            transferAt.getTime() >= booking.checkOut.getTime()
          ) {
            throw new BadRequestException(
              'transferAt must be on/after check-in and before check-out',
            );
          }

          const covering = activeSegments.find(
            (br) =>
              br.checkIn.getTime() <= transferAt.getTime() &&
              transferAt.getTime() < br.checkOut.getTime(),
          );
          if (!covering) {
            throw new BadRequestException(
              'transferAt does not fall inside any active segment',
            );
          }
          if (covering.roomId === dto.roomId) {
            throw new BadRequestException(
              'Target room must differ from the current segment room',
            );
          }

          const counts: GuestCounts = {
            adults: booking.adults,
            children: booking.children,
            infants: booking.infants,
          };
          const beds = occupyingBeds(counts);

          // Lock both rooms in stable UUID order to avoid deadlocks with create.
          const lockIds = [covering.roomId, dto.roomId].sort();
          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM rooms
            WHERE id IN (${Prisma.join(lockIds.map((rid) => Prisma.sql`${rid}::uuid`))})
            ORDER BY id
            FOR UPDATE
          `;
          if (locked.length !== 2) {
            throw new NotFoundException('Room not found');
          }

          const newRoom = await tx.room.findUnique({
            where: { id: dto.roomId },
            include: { category: true, cottage: true },
          });
          if (!newRoom || !newRoom.isActive || !newRoom.cottage.isActive) {
            throw new BadRequestException('Target room is not available');
          }
          if (!newRoom.category.isActive) {
            throw new BadRequestException('Target category is not available');
          }
          if (newRoom.capacity < beds) {
            throw new BadRequestException(
              `Room capacity (${newRoom.capacity}) is less than occupying guests (${beds}; infants excluded)`,
            );
          }

          const segmentEnd = covering.checkOut;
          // Availability for the NEW segment only; exclude this booking (self).
          await this.availability.assertRoomAcceptsGuests(
            newRoom.id,
            newRoom.capacity,
            beds,
            transferAt,
            segmentEnd,
            tx,
            { excludeBookingId: id },
          );

          const sameCategory =
            covering.room.categoryId === newRoom.categoryId;
          const oldPrices = categoryPrices(covering.room.category);
          const newPrices = categoryPrices(newRoom.category);

          const wholeStayMove =
            transferAt.getTime() === covering.checkIn.getTime();

          let livedNights: number;
          let remainingNights: number;
          let segmentACheckOut = transferAt;
          let segmentBCheckIn = transferAt;
          let segmentBCheckOut = segmentEnd;

          if (wholeStayMove) {
            livedNights = 0;
            remainingNights = nightsBetween(covering.checkIn, covering.checkOut);
            // Recalculate remaining nights from booking-level if this is the
            // only/full segment covering the whole stay.
            if (
              covering.checkIn.getTime() === booking.checkIn.getTime() &&
              covering.checkOut.getTime() === booking.checkOut.getTime()
            ) {
              remainingNights = nightsBetween(booking.checkIn, booking.checkOut);
            }
          } else {
            const split = splitStayAtTransfer(
              covering.checkIn,
              covering.checkOut,
              transferAt,
            );
            livedNights = split.segmentA.nights;
            remainingNights = split.segmentB.nights;
            segmentACheckOut = split.segmentA.checkOut;
            segmentBCheckIn = split.segmentB.checkIn;
            segmentBCheckOut = split.segmentB.checkOut;
          }

          const money = calcTransferMoney({
            livedNights,
            remainingNights,
            counts,
            oldPrices,
            newPrices,
            sameCategory,
            surchargeOverride: sameCategory ? null : dto.surchargeAmount,
          });

          // Preserve amounts of earlier segments (index < covering).
          const earlier = activeSegments.filter(
            (br) => br.segmentIndex < covering.segmentIndex,
          );
          const earlierTotal = earlier.reduce(
            (sum, br) => sum.add(toDecimal(br.amount ?? 0)),
            new Decimal(0),
          );

          // Mid-stay: truncate A (skipCleaningBuffer) + insert B.
          // Whole-stay move: replace covering segment in place (no empty A).
          const nextIndex = covering.segmentIndex + (wholeStayMove ? 0 : 1);

          if (wholeStayMove) {
            await tx.bookingRoom.update({
              where: { id: covering.id },
              data: {
                roomId: newRoom.id,
                bedsBooked: beds,
                amount: money.segmentBAmount,
                skipCleaningBuffer: false,
              },
            });
          } else {
            // Bump later segments' indexes to make room for the new one.
            const later = activeSegments.filter(
              (br) => br.segmentIndex > covering.segmentIndex,
            );
            for (const br of [...later].sort(
              (a, b) => b.segmentIndex - a.segmentIndex,
            )) {
              await tx.bookingRoom.update({
                where: { id: br.id },
                data: { segmentIndex: br.segmentIndex + 1 },
              });
            }

            await tx.bookingRoom.update({
              where: { id: covering.id },
              data: {
                checkOut: segmentACheckOut,
                amount: money.segmentAAmount,
                skipCleaningBuffer: true,
              },
            });

            await tx.bookingRoom.create({
              data: {
                bookingId: id,
                roomId: newRoom.id,
                bedsBooked: beds,
                checkIn: segmentBCheckIn,
                checkOut: segmentBCheckOut,
                isActive: true,
                segmentIndex: nextIndex,
                amount: money.segmentBAmount,
                skipCleaningBuffer: false,
              },
            });
          }

          // If covering was not the last segment and we only moved part of it,
          // later segments keep their rooms; booking.checkOut stays the same.
          const totalAmount = earlierTotal
            .add(wholeStayMove ? money.segmentBAmount : money.segmentAAmount)
            .add(wholeStayMove ? new Decimal(0) : money.segmentBAmount)
            .toDecimalPlaces(2);

          // For same-class transfer of a bargained booking: keep prior total.
          const finalTotal = sameCategory
            ? booking.totalAmount
            : totalAmount;
          const remainingAmount = calcRemainingAfterTotalChange(
            finalTotal,
            booking.paidAmount,
          );

          let paymentStatus = booking.paymentStatus;
          if (booking.paidAmount.gte(finalTotal) && finalTotal.gt(0)) {
            paymentStatus = PaymentStatus.paid_full;
          } else if (
            booking.paidAmount.gte(booking.depositAmount) &&
            booking.paidAmount.gt(0)
          ) {
            paymentStatus = PaymentStatus.deposit_paid;
          } else if (booking.paidAmount.lte(0)) {
            paymentStatus = PaymentStatus.unpaid;
          }

          const afterRooms = await tx.bookingRoom.findMany({
            where: { bookingId: id },
            include: {
              room: { include: { cottage: true, category: true } },
            },
            orderBy: { segmentIndex: 'asc' },
          });

          const priceBreakdown = buildPriceBreakdown({
            segments: afterRooms.map((br) => {
              const segNights = nightsBetween(br.checkIn, br.checkOut);
              const prices = categoryPrices(br.room.category);
              return {
                segmentIndex: br.segmentIndex,
                bookingRoomId: br.id,
                roomId: br.roomId,
                checkIn: br.checkIn,
                checkOut: br.checkOut,
                bedsBooked: br.bedsBooked,
                amount: br.amount ?? 0,
                isActive: br.isActive,
                nights: segNights,
                nightlySubtotal: decimalToString(
                  calcNightlySubtotal(counts, prices),
                ),
                categoryCode: br.room.category.code,
                roomNumber: br.room.number,
              };
            }),
            total: finalTotal,
            lastAdjustment: {
              operation: money.operation,
              amount: decimalToString(money.appliedSurcharge),
              note: dto.note,
            },
          });

          const after = await tx.booking.update({
            where: { id },
            data: {
              totalAmount: finalTotal,
              remainingAmount,
              paymentStatus,
              priceBreakdown: priceBreakdown as unknown as Prisma.InputJsonValue,
              // priceOriginal unchanged — catalog snapshot at creation
            },
            include: {
              customer: true,
              bookingRooms: {
                include: {
                  room: { include: { cottage: true, category: true } },
                },
                orderBy: { segmentIndex: 'asc' },
              },
            },
          });

          await tx.auditLog.create({
            data: {
              actorType: actor.type,
              actorId: actor.id,
              entity: 'booking',
              entityId: id,
              action: money.operation,
              diff: {
                before: {
                  roomId: covering.roomId,
                  roomNumber: covering.room.number,
                  category: covering.room.category.code,
                  totalAmount: decimalToString(booking.totalAmount),
                  remainingAmount: decimalToString(booking.remainingAmount),
                  paidAmount: decimalToString(booking.paidAmount),
                },
                after: {
                  roomId: newRoom.id,
                  roomNumber: newRoom.number,
                  category: newRoom.category.code,
                  transferAt: formatTransferAt(transferAt),
                  operation: money.operation,
                  surcharge: decimalToString(money.appliedSurcharge),
                  suggestedSurcharge: decimalToString(
                    money.suggestedSurcharge,
                  ),
                  totalAmount: decimalToString(finalTotal),
                  remainingAmount: decimalToString(remainingAmount),
                  paidAmount: decimalToString(booking.paidAmount),
                  skipCleaningBuffer: !wholeStayMove,
                  priceBreakdown,
                },
              },
            },
          });

          const transferredPayload: BookingTransferredPayload = {
            booking: this.toSnapshot(after),
            operation: money.operation,
            transferAt: formatTransferAt(transferAt),
            from: {
              roomId: covering.roomId,
              roomNumber: covering.room.number,
              categoryCode: covering.room.category.code,
              segmentIndex: covering.segmentIndex,
            },
            to: {
              roomId: newRoom.id,
              roomNumber: newRoom.number,
              categoryCode: newRoom.category.code,
              segmentIndex: wholeStayMove
                ? covering.segmentIndex
                : nextIndex,
            },
            releasedBeds: beds,
            surchargeAmount: decimalToString(money.appliedSurcharge),
            priceBreakdown,
          };

          return {
            booking: after,
            money,
            transferredPayload,
            priceBreakdown,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );

      this.events.emit(
        BOOKING_TRANSFERRED_EVENT,
        result.transferredPayload,
      );

      return {
        ...this.toView(result.booking),
        priceBreakdown: result.priceBreakdown,
        operation: result.money.operation,
        surchargeAmount: decimalToString(result.money.appliedSurcharge),
        suggestedSurcharge: decimalToString(result.money.suggestedSurcharge),
        livedNights: result.money.livedNights,
        remainingNights: result.money.remainingNights,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
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

  /**
   * Extend stay in the current (last) room. If the room cannot accept the
   * extra nights → 409 with same-class transfer offers (TRANSFER.md §4).
   * With transferToRoomId, append a new segment for the extension on that room.
   */
  async extendBooking(
    id: string,
    dto: ExtendBookingDto,
    actor: { type: ActorType; id: string },
  ) {
    try {
      const preview = await this.prisma.$transaction(
        async (tx) => {
          const booking = await tx.booking.findUnique({
            where: { id },
            include: {
              customer: true,
              bookingRooms: {
                include: {
                  room: { include: { cottage: true, category: true } },
                },
                orderBy: { segmentIndex: 'asc' },
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
              `Cannot extend booking in status ${booking.status}`,
            );
          }
          if (!OCCUPYING_STATUSES.includes(booking.status)) {
            throw new UnprocessableEntityException(
              `Cannot extend booking in status ${booking.status}`,
            );
          }

          const activeSegments = booking.bookingRooms.filter((br) => br.isActive);
          const last =
            activeSegments[activeSegments.length - 1] ??
            booking.bookingRooms[booking.bookingRooms.length - 1];
          if (!last) {
            throw new BadRequestException('Booking has no room segments');
          }

          const newCheckOutTime =
            dto.newCheckOutTime ?? formatLocalTime(booking.checkOut);
          const newCheckOut = parseLocalDateTime(
            dto.newCheckOut,
            newCheckOutTime,
            'newCheckOut',
          );
          if (!(newCheckOut.getTime() > booking.checkOut.getTime())) {
            throw new BadRequestException(
              'newCheckOut must be after the current check-out',
            );
          }

          const counts: GuestCounts = {
            adults: booking.adults,
            children: booking.children,
            infants: booking.infants,
          };
          const beds = occupyingBeds(counts);
          const prices = categoryPrices(last.room.category);
          const money = calcExtendMoney({
            previousCheckIn: booking.checkIn,
            previousCheckOut: booking.checkOut,
            newCheckOut,
            counts,
            prices,
            previousTotal: booking.totalAmount,
            addedAmountOverride: dto.addedAmount,
          });

          const extendFrom = booking.checkOut;
          const offerCategoryCode = (
            dto.offerCategoryCode ?? last.room.category.code
          ).toLowerCase();

          // Path A: transfer-to-room for the extension tail only.
          if (dto.transferToRoomId) {
            if (dto.transferToRoomId === last.roomId) {
              throw new BadRequestException(
                'transferToRoomId must differ from the current room',
              );
            }
            const lockIds = [last.roomId, dto.transferToRoomId].sort();
            await tx.$queryRaw`
              SELECT id FROM rooms
              WHERE id IN (${Prisma.join(lockIds.map((rid) => Prisma.sql`${rid}::uuid`))})
              ORDER BY id
              FOR UPDATE
            `;

            const target = await tx.room.findUnique({
              where: { id: dto.transferToRoomId },
              include: { category: true, cottage: true },
            });
            if (!target || !target.isActive || !target.cottage.isActive) {
              throw new BadRequestException('Transfer target room is not available');
            }
            if (target.capacity < beds) {
              throw new BadRequestException(
                `Room capacity (${target.capacity}) is less than occupying guests (${beds})`,
              );
            }

            await this.availability.assertRoomAcceptsGuests(
              target.id,
              target.capacity,
              beds,
              extendFrom,
              newCheckOut,
              tx,
              { excludeBookingId: id },
            );

            // Extension on a different category → age-price the added nights there.
            const targetPrices = categoryPrices(target.category);
            const extendMoney =
              target.categoryId === last.room.categoryId
                ? money
                : calcExtendMoney({
                    previousCheckIn: booking.checkIn,
                    previousCheckOut: booking.checkOut,
                    newCheckOut,
                    counts,
                    prices: targetPrices,
                    previousTotal: booking.totalAmount,
                    addedAmountOverride: dto.addedAmount,
                  });

            await tx.bookingRoom.update({
              where: { id: last.id },
              data: { skipCleaningBuffer: true },
            });

            const newSeg = await tx.bookingRoom.create({
              data: {
                bookingId: id,
                roomId: target.id,
                bedsBooked: beds,
                checkIn: extendFrom,
                checkOut: newCheckOut,
                isActive: true,
                segmentIndex: last.segmentIndex + 1,
                amount: extendMoney.appliedAddedAmount,
                skipCleaningBuffer: false,
              },
            });

            const finalTotal = extendMoney.newTotal;
            const remainingAmount = calcRemainingAfterTotalChange(
              finalTotal,
              booking.paidAmount,
            );
            let paymentStatus = booking.paymentStatus;
            if (booking.paidAmount.gte(finalTotal) && finalTotal.gt(0)) {
              paymentStatus = PaymentStatus.paid_full;
            } else if (
              booking.paidAmount.gte(booking.depositAmount) &&
              booking.paidAmount.gt(0)
            ) {
              paymentStatus = PaymentStatus.deposit_paid;
            }

            const afterRooms = await tx.bookingRoom.findMany({
              where: { bookingId: id },
              include: {
                room: { include: { cottage: true, category: true } },
              },
              orderBy: { segmentIndex: 'asc' },
            });
            const priceBreakdown = buildPriceBreakdown({
              segments: afterRooms.map((br) => ({
                segmentIndex: br.segmentIndex,
                bookingRoomId: br.id,
                roomId: br.roomId,
                checkIn: br.checkIn,
                checkOut: br.checkOut,
                bedsBooked: br.bedsBooked,
                amount: br.amount ?? 0,
                isActive: br.isActive,
                nights: nightsBetween(br.checkIn, br.checkOut),
                nightlySubtotal: decimalToString(
                  calcNightlySubtotal(counts, categoryPrices(br.room.category)),
                ),
                categoryCode: br.room.category.code,
                roomNumber: br.room.number,
              })),
              total: finalTotal,
              lastAdjustment: {
                operation: 'extend',
                amount: decimalToString(extendMoney.appliedAddedAmount),
                note: dto.note,
              },
            });

            const after = await tx.booking.update({
              where: { id },
              data: {
                checkOut: newCheckOut,
                totalAmount: finalTotal,
                remainingAmount,
                paymentStatus,
                priceBreakdown:
                  priceBreakdown as unknown as Prisma.InputJsonValue,
              },
              include: {
                customer: true,
                bookingRooms: {
                  include: {
                    room: { include: { cottage: true, category: true } },
                  },
                  orderBy: { segmentIndex: 'asc' },
                },
              },
            });

            await tx.auditLog.create({
              data: {
                actorType: actor.type,
                actorId: actor.id,
                entity: 'booking',
                entityId: id,
                action: 'extend_via_transfer',
                diff: {
                  before: {
                    checkOut: formatLocalDate(booking.checkOut),
                    checkOutTime: formatLocalTime(booking.checkOut),
                    totalAmount: decimalToString(booking.totalAmount),
                    roomId: last.roomId,
                  },
                  after: {
                    checkOut: formatLocalDate(newCheckOut),
                    checkOutTime: formatLocalTime(newCheckOut),
                    totalAmount: decimalToString(finalTotal),
                    addedAmount: decimalToString(
                      extendMoney.appliedAddedAmount,
                    ),
                    transferToRoomId: target.id,
                    newSegmentId: newSeg.id,
                    skipCleaningBufferOnPrior: true,
                    priceBreakdown,
                  },
                },
              },
            });

            const transferredPayload: BookingTransferredPayload = {
              booking: this.toSnapshot(after),
              operation:
                target.categoryId === last.room.categoryId
                  ? 'transfer'
                  : 'upgrade',
              transferAt: formatTransferAt(extendFrom),
              from: {
                roomId: last.roomId,
                roomNumber: last.room.number,
                categoryCode: last.room.category.code,
                segmentIndex: last.segmentIndex,
              },
              to: {
                roomId: target.id,
                roomNumber: target.number,
                categoryCode: target.category.code,
                segmentIndex: last.segmentIndex + 1,
              },
              releasedBeds: beds,
              surchargeAmount: decimalToString(extendMoney.appliedAddedAmount),
              priceBreakdown,
            };

            return {
              kind: 'ok' as const,
              booking: after,
              money: extendMoney,
              priceBreakdown,
              transferredPayload,
              previousCheckOut: booking.checkOut,
            };
          }

          // Path B: extend same room.
          await tx.$queryRaw`
            SELECT id FROM rooms WHERE id = ${last.roomId}::uuid FOR UPDATE
          `;

          try {
            await this.availability.assertRoomAcceptsGuests(
              last.roomId,
              last.room.capacity,
              beds,
              extendFrom,
              newCheckOut,
              tx,
              { excludeBookingId: id },
            );
          } catch (err) {
            if (!(err instanceof ConflictException)) {
              throw err;
            }
            // Build transfer offers (same / chosen class) for the extension window.
            const candidates = await this.availability.resolveBookableRooms({
              categoryCode: offerCategoryCode,
              minCapacity: beds,
            });
            const offers: Array<{
              id: string;
              number: string;
              capacity: number;
              categoryCode: string;
              cottageName: string;
              priceAdult: string;
              priceChild: string;
              priceInfant: string;
            }> = [];
            for (const room of candidates) {
              if (room.id === last.roomId) {
                continue;
              }
              const snap = await this.availability.getRoomStaySnapshot(
                room.id,
                room.capacity,
                extendFrom,
                newCheckOut,
                tx,
                { excludeBookingId: id },
              );
              if (
                snap.remainingBeds >= beds &&
                !snap.locked
              ) {
                offers.push({
                  id: room.id,
                  number: room.number,
                  capacity: room.capacity,
                  categoryCode: room.categoryCode,
                  cottageName: room.cottageName,
                  priceAdult: decimalToString(room.priceAdult),
                  priceChild: decimalToString(room.priceChild),
                  priceInfant: decimalToString(room.priceInfant),
                });
              }
            }
            return {
              kind: 'blocked' as const,
              message:
                'Продление в текущем номере невозможно: места заняты. Предложен перенос в свободный номер того же класса.',
              code: 'EXTEND_BLOCKED',
              transferOffers: offers,
              requested: {
                from: extendFrom.toISOString(),
                to: newCheckOut.toISOString(),
                beds,
                categoryCode: offerCategoryCode,
              },
            };
          }

          await tx.bookingRoom.update({
            where: { id: last.id },
            data: {
              checkOut: newCheckOut,
              amount: toDecimal(last.amount ?? booking.totalAmount)
                .add(money.appliedAddedAmount)
                .toDecimalPlaces(2),
            },
          });

          const finalTotal = money.newTotal;
          const remainingAmount = calcRemainingAfterTotalChange(
            finalTotal,
            booking.paidAmount,
          );
          let paymentStatus = booking.paymentStatus;
          if (booking.paidAmount.gte(finalTotal) && finalTotal.gt(0)) {
            paymentStatus = PaymentStatus.paid_full;
          } else if (
            booking.paidAmount.gte(booking.depositAmount) &&
            booking.paidAmount.gt(0)
          ) {
            paymentStatus = PaymentStatus.deposit_paid;
          }

          const afterRooms = await tx.bookingRoom.findMany({
            where: { bookingId: id },
            include: {
              room: { include: { cottage: true, category: true } },
            },
            orderBy: { segmentIndex: 'asc' },
          });
          const priceBreakdown = buildPriceBreakdown({
            segments: afterRooms.map((br) => ({
              segmentIndex: br.segmentIndex,
              bookingRoomId: br.id,
              roomId: br.roomId,
              checkIn: br.checkIn,
              checkOut: br.checkOut,
              bedsBooked: br.bedsBooked,
              amount: br.amount ?? 0,
              isActive: br.isActive,
              nights: nightsBetween(br.checkIn, br.checkOut),
              nightlySubtotal: decimalToString(
                calcNightlySubtotal(counts, categoryPrices(br.room.category)),
              ),
              categoryCode: br.room.category.code,
              roomNumber: br.room.number,
            })),
            total: finalTotal,
            lastAdjustment: {
              operation: 'extend',
              amount: decimalToString(money.appliedAddedAmount),
              note: dto.note,
            },
          });

          const after = await tx.booking.update({
            where: { id },
            data: {
              checkOut: newCheckOut,
              totalAmount: finalTotal,
              remainingAmount,
              paymentStatus,
              priceBreakdown:
                priceBreakdown as unknown as Prisma.InputJsonValue,
            },
            include: {
              customer: true,
              bookingRooms: {
                include: {
                  room: { include: { cottage: true, category: true } },
                },
                orderBy: { segmentIndex: 'asc' },
              },
            },
          });

          await tx.auditLog.create({
            data: {
              actorType: actor.type,
              actorId: actor.id,
              entity: 'booking',
              entityId: id,
              action: 'extend',
              diff: {
                before: {
                  checkOut: formatLocalDate(booking.checkOut),
                  checkOutTime: formatLocalTime(booking.checkOut),
                  totalAmount: decimalToString(booking.totalAmount),
                  remainingAmount: decimalToString(booking.remainingAmount),
                },
                after: {
                  checkOut: formatLocalDate(newCheckOut),
                  checkOutTime: formatLocalTime(newCheckOut),
                  totalAmount: decimalToString(finalTotal),
                  remainingAmount: decimalToString(remainingAmount),
                  addedNights: money.addedNights,
                  addedAmount: decimalToString(money.appliedAddedAmount),
                  catalogAddedAmount: decimalToString(
                    money.catalogAddedAmount,
                  ),
                  paidAmount: decimalToString(booking.paidAmount),
                  priceBreakdown,
                },
              },
            },
          });

            return {
              kind: 'ok' as const,
              booking: after,
              money,
              priceBreakdown,
              transferredPayload: null,
              previousCheckOut: booking.checkOut,
            };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );

      if (preview.kind === 'blocked') {
        throw new ConflictException({
          message: preview.message,
          code: preview.code,
          transferOffers: preview.transferOffers,
          requested: preview.requested,
        });
      }

      if (preview.transferredPayload) {
        this.events.emit(
          BOOKING_TRANSFERRED_EVENT,
          preview.transferredPayload,
        );
      } else {
        this.events.emit(BOOKING_UPDATED_EVENT, {
          bookingId: preview.booking.id,
          publicCode: preview.booking.publicCode,
          changes: [
            {
              field: 'checkOut',
              from: formatLocalDate(preview.previousCheckOut),
              to: formatLocalDate(preview.booking.checkOut),
            },
            {
              field: 'totalAmount',
              from: decimalToString(preview.money.previousTotal),
              to: decimalToString(preview.money.newTotal),
            },
          ],
        });
      }

      return {
        ...this.toView(preview.booking),
        priceBreakdown: preview.priceBreakdown,
        operation: 'extend' as const,
        addedNights: preview.money.addedNights,
        addedAmount: decimalToString(preview.money.appliedAddedAmount),
        catalogAddedAmount: decimalToString(
          preview.money.catalogAddedAmount,
        ),
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
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
      adults: booking.adults,
      children: booking.children,
      infants: booking.infants,
      checkIn: formatLocalDate(booking.checkIn),
      checkOut: formatLocalDate(booking.checkOut),
      checkInTime: formatLocalTime(booking.checkIn),
      checkOutTime: formatLocalTime(booking.checkOut),
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
      adults: number;
      children: number;
      infants: number;
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
      priceBreakdown?: Prisma.JsonValue | PriceBreakdown | null;
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
        segmentIndex?: number;
        amount?: Decimal | null;
        skipCleaningBuffer?: boolean;
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
      checkIn: formatLocalDate(booking.checkIn),
      checkOut: formatLocalDate(booking.checkOut),
      checkInTime: formatLocalTime(booking.checkIn),
      checkOutTime: formatLocalTime(booking.checkOut),
      checkInAt: booking.checkIn.toISOString(),
      checkOutAt: booking.checkOut.toISOString(),
      bedsTotal: booking.bedsTotal,
      adults: booking.adults,
      children: booking.children,
      infants: booking.infants,
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
        checkIn: formatLocalDate(br.checkIn),
        checkOut: formatLocalDate(br.checkOut),
        checkInTime: formatLocalTime(br.checkIn),
        checkOutTime: formatLocalTime(br.checkOut),
        checkInAt: br.checkIn.toISOString(),
        checkOutAt: br.checkOut.toISOString(),
        segmentIndex: br.segmentIndex ?? 0,
        amount: br.amount != null ? decimalToString(br.amount) : null,
        skipCleaningBuffer: Boolean(br.skipCleaningBuffer),
        cottageId: br.room.cottage.id,
        cottageName: br.room.cottage.name,
        categoryCode: br.room.category.code,
        isActive: br.isActive,
      })),
      priceBreakdown: (booking.priceBreakdown as PriceBreakdown | null) ?? null,
    };
  }
}
