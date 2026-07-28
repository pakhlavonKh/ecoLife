import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  getCleaningBufferMinutes,
  getDefaultCheckInTime,
  getDefaultCheckOutTime,
} from '../common/utils/booking-time';
import {
  validateStayDates,
  type ValidatedStay,
} from '../common/utils/dates';
import { decimalToString } from '../common/utils/money';
import { addMinutes } from '../common/utils/datetime';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAcceptGuests,
  hasOverlappingLock,
  maxOccupiedOverStay,
  remainingBeds,
  type OccupancyStay,
} from './occupancy';

export const BEDS_UNAVAILABLE_MESSAGE =
  'на эти дату и время в номере не осталось мест';

export type AvailableRoomView = {
  id: string;
  number: string;
  capacity: number;
  /** Min free beds across nights in the requested stay (0 if locked). */
  remainingBeds: number;
  categoryCode: string;
  cottageId: string;
  cottageName: string;
  /** Price per bed per night (UZS). */
  pricePerNight: string;
};

export type CategoryAvailabilityView = {
  id: string;
  code: string;
  name: string;
  depositPercent: number;
  /** Sum of remainingBeds across bookable rooms. */
  availableBeds: number;
  availableRoomsCount: number;
  /** Present for admin responses, or when category_code+guests requested publicly. */
  availableRooms?: AvailableRoomView[];
};

type RoomWithPrice = {
  id: string;
  number: string;
  capacity: number;
  categoryId: string;
  categoryCode: string;
  cottageId: string;
  cottageName: string;
  cottageSortOrder: number;
  pricePerNight: Decimal;
};

type TxClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Minutes released beds stay blocked after a check-out (HOURLY.md §3).
   * Config-only: never persisted, so changing it re-prices future availability.
   */
  get cleaningBufferMinutes(): number {
    return getCleaningBufferMinutes(this.config);
  }

  validateQuery(
    checkIn: string,
    checkOut: string,
    times?: { checkInTime?: string; checkOutTime?: string },
  ): ValidatedStay {
    return validateStayDates(checkIn, checkOut, {
      minNights: Number(this.config.get('MIN_STAY_NIGHTS') ?? 1),
      maxNights: Number(this.config.get('MAX_STAY_NIGHTS') ?? 30),
      checkInTime: times?.checkInTime ?? getDefaultCheckInTime(this.config),
      checkOutTime: times?.checkOutTime ?? getDefaultCheckOutTime(this.config),
    });
  }

  /**
   * Active bed stays whose effective interval (stay + cleaning buffer) overlaps
   * [checkIn, checkOut). Expired pending_payment holds are ignored even before
   * the worker runs. The buffer is not stored — it only widens the load window.
   */
  async loadActiveStaysByRoom(
    roomIds: string[],
    checkIn: Date,
    checkOut: Date,
    tx: TxClient = this.prisma,
    options?: { excludeBookingId?: string; bufferMinutes?: number },
  ): Promise<Map<string, OccupancyStay[]>> {
    const map = new Map<string, OccupancyStay[]>();
    for (const id of roomIds) {
      map.set(id, []);
    }
    if (roomIds.length === 0) {
      return map;
    }

    const bufferMinutes =
      options?.bufferMinutes ?? this.cleaningBufferMinutes;
    // A stay that checked out `buffer` minutes ago can still block checkIn.
    const loadFrom = addMinutes(checkIn, -bufferMinutes);
    const excludeId = options?.excludeBookingId ?? null;
    const rows = await tx.$queryRaw<
      {
        room_id: string;
        check_in: Date;
        check_out: Date;
        beds_booked: number;
      }[]
    >`
      SELECT br.room_id, br.check_in, br.check_out, br.beds_booked
      FROM booking_rooms br
      INNER JOIN bookings b ON b.id = br.booking_id
      WHERE br.is_active = true
        AND br.room_id IN (${Prisma.join(roomIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND br.check_in < ${checkOut}::timestamptz
        AND br.check_out > ${loadFrom}::timestamptz
        AND (
          b.status <> ${BookingStatus.pending_payment}::booking_status
          OR b.expires_at IS NULL
          OR b.expires_at > NOW()
        )
        AND (${excludeId}::uuid IS NULL OR b.id <> ${excludeId}::uuid)
    `;

    for (const row of rows) {
      const list = map.get(row.room_id) ?? [];
      list.push({
        checkIn: new Date(row.check_in),
        checkOut: new Date(row.check_out),
        beds: Number(row.beds_booked),
      });
      map.set(row.room_id, list);
    }
    return map;
  }

  /**
   * Rooms that have a room_lock overlapping [checkIn, checkOut).
   */
  async findLockedRoomIds(
    checkIn: Date,
    checkOut: Date,
    tx: TxClient = this.prisma,
    options?: { roomIds?: string[] },
  ): Promise<Set<string>> {
    const roomIds = options?.roomIds;
    const rows =
      roomIds && roomIds.length > 0
        ? await tx.$queryRaw<{ room_id: string }[]>`
            SELECT DISTINCT rl.room_id
            FROM room_locks rl
            WHERE rl.room_id IN (${Prisma.join(roomIds.map((id) => Prisma.sql`${id}::uuid`))})
              AND rl.check_in < ${checkOut}::timestamptz
              AND rl.check_out > ${checkIn}::timestamptz
          `
        : roomIds && roomIds.length === 0
          ? []
          : await tx.$queryRaw<{ room_id: string }[]>`
            SELECT DISTINCT rl.room_id
            FROM room_locks rl
            WHERE rl.check_in < ${checkOut}::timestamptz
              AND rl.check_out > ${checkIn}::timestamptz
          `;
    return new Set(rows.map((r) => r.room_id));
  }

  /**
   * Snapshot used inside booking / lock transactions (room row already FOR UPDATE).
   */
  async getRoomStaySnapshot(
    roomId: string,
    capacity: number,
    checkIn: Date,
    checkOut: Date,
    tx: TxClient,
    options?: { excludeBookingId?: string },
  ): Promise<{
    maxOccupied: number;
    remainingBeds: number;
    locked: boolean;
  }> {
    const bufferMinutes = this.cleaningBufferMinutes;
    const staysByRoom = await this.loadActiveStaysByRoom(
      [roomId],
      checkIn,
      checkOut,
      tx,
      { ...options, bufferMinutes },
    );
    const stays = staysByRoom.get(roomId) ?? [];
    const lockedIds = await this.findLockedRoomIds(checkIn, checkOut, tx, {
      roomIds: [roomId],
    });
    const locked = lockedIds.has(roomId);
    const maxOccupied = maxOccupiedOverStay(
      checkIn,
      checkOut,
      stays,
      bufferMinutes,
    );
    return {
      maxOccupied,
      remainingBeds: remainingBeds(capacity, maxOccupied, locked),
      locked,
    };
  }

  /**
   * Throws 409 if the room cannot accept `guests` for the stay
   * (effective bed capacity over the time window, or overlapping room_lock).
   */
  async assertRoomAcceptsGuests(
    roomId: string,
    capacity: number,
    guests: number,
    checkIn: Date,
    checkOut: Date,
    tx: TxClient,
    options?: { excludeBookingId?: string },
  ): Promise<void> {
    const snap = await this.getRoomStaySnapshot(
      roomId,
      capacity,
      checkIn,
      checkOut,
      tx,
      options,
    );
    if (
      !canAcceptGuests(capacity, snap.maxOccupied, guests, snap.locked)
    ) {
      throw new ConflictException(BEDS_UNAVAILABLE_MESSAGE);
    }
  }

  /**
   * True if any active (non-expired) beds are booked over the lock window,
   * including cleaning tails on those beds (Variant б).
   */
  async assertRoomHasNoBookedBeds(
    roomId: string,
    checkIn: Date,
    checkOut: Date,
    tx: TxClient,
    options?: { excludeBookingId?: string },
  ): Promise<void> {
    const bufferMinutes = this.cleaningBufferMinutes;
    const staysByRoom = await this.loadActiveStaysByRoom(
      [roomId],
      checkIn,
      checkOut,
      tx,
      { ...options, bufferMinutes },
    );
    const stays = staysByRoom.get(roomId) ?? [];
    const maxOccupied = maxOccupiedOverStay(
      checkIn,
      checkOut,
      stays,
      bufferMinutes,
    );
    if (maxOccupied > 0) {
      throw new ConflictException(
        'нельзя закрыть номер: на эти дату и время уже есть брони',
      );
    }
  }

  async resolveBookableRooms(filters?: {
    categoryCode?: string;
    minCapacity?: number;
  }): Promise<RoomWithPrice[]> {
    const rooms = await this.prisma.room.findMany({
      where: {
        isActive: true,
        cottage: { isActive: true },
        category: {
          isActive: true,
          ...(filters?.categoryCode
            ? { code: filters.categoryCode.toLowerCase() }
            : {}),
        },
        ...(filters?.minCapacity != null
          ? { capacity: { gte: filters.minCapacity } }
          : {}),
      },
      include: {
        cottage: true,
        category: true,
      },
      orderBy: [
        { cottage: { sortOrder: 'asc' } },
        { number: 'asc' },
      ],
    });

    return rooms.map((room) => ({
      id: room.id,
      number: room.number,
      capacity: room.capacity,
      categoryId: room.categoryId,
      categoryCode: room.category.code,
      cottageId: room.cottageId,
      cottageName: room.cottage.name,
      cottageSortOrder: room.cottage.sortOrder,
      pricePerNight: room.category.pricePerBedPerNight,
    }));
  }

  /**
   * Display order: cottage (Tue→Sun via sortOrder), then room number ascending.
   */
  sortByCottageThenNumber<
    T extends { cottageSortOrder: number; number: string },
  >(rooms: T[]): T[] {
    return [...rooms].sort((a, b) => {
      if (a.cottageSortOrder !== b.cottageSortOrder) {
        return a.cottageSortOrder - b.cottageSortOrder;
      }
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });
  }

  /**
   * Best-fit: capacity >= guests, smallest capacity first, then room number.
   */
  sortBestFit<T extends { capacity: number; number: string }>(
    rooms: T[],
  ): T[] {
    return [...rooms].sort((a, b) => {
      if (a.capacity !== b.capacity) {
        return a.capacity - b.capacity;
      }
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });
  }

  private async annotateRemaining(
    bookable: RoomWithPrice[],
    checkIn: Date,
    checkOut: Date,
    guests?: number,
    options?: { excludeBookingId?: string },
  ): Promise<Array<RoomWithPrice & { remainingBeds: number }>> {
    const roomIds = bookable.map((r) => r.id);
    const bufferMinutes = this.cleaningBufferMinutes;
    const [staysByRoom, lockedIds] = await Promise.all([
      this.loadActiveStaysByRoom(roomIds, checkIn, checkOut, this.prisma, {
        ...options,
        bufferMinutes,
      }),
      this.findLockedRoomIds(checkIn, checkOut, this.prisma, { roomIds }),
    ]);

    const annotated: Array<RoomWithPrice & { remainingBeds: number }> = [];
    for (const room of bookable) {
      const locked = lockedIds.has(room.id);
      const stays = staysByRoom.get(room.id) ?? [];
      const maxOccupied = maxOccupiedOverStay(
        checkIn,
        checkOut,
        stays,
        bufferMinutes,
      );
      const rem = remainingBeds(room.capacity, maxOccupied, locked);
      if (guests != null && rem < guests) {
        continue;
      }
      annotated.push({ ...room, remainingBeds: rem });
    }
    return annotated;
  }

  async getPublicAvailability(
    checkInStr: string,
    checkOutStr: string,
    opts?: { categoryCode?: string; guests?: number },
  ) {
    const stay = this.validateQuery(checkInStr, checkOutStr);

    const categories = await this.prisma.roomCategory.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });

    const bookable = await this.resolveBookableRooms({
      categoryCode: opts?.categoryCode,
      minCapacity: opts?.guests,
    });

    const available = await this.annotateRemaining(
      bookable,
      stay.checkIn,
      stay.checkOut,
      opts?.guests,
    );

    const includeRooms =
      opts?.categoryCode != null && opts?.guests != null;

    const categoryViews: CategoryAvailabilityView[] = categories
      .filter((c) =>
        opts?.categoryCode
          ? c.code === opts.categoryCode.toLowerCase()
          : true,
      )
      .map((cat) => {
        const rooms = this.sortByCottageThenNumber(
          available.filter((r) => r.categoryCode === cat.code),
        );
        const view: CategoryAvailabilityView = {
          id: cat.id,
          code: cat.code,
          name: cat.name,
          depositPercent: cat.depositPercent,
          availableBeds: rooms.reduce((sum, r) => sum + r.remainingBeds, 0),
          availableRoomsCount: rooms.length,
        };
        if (includeRooms) {
          view.availableRooms = rooms.map((r) => this.toRoomView(r));
        }
        return view;
      });

    return {
      checkIn: stay.checkInStr,
      checkOut: stay.checkOutStr,
      checkInTime: stay.checkInTime,
      checkOutTime: stay.checkOutTime,
      checkInAt: stay.checkIn.toISOString(),
      checkOutAt: stay.checkOut.toISOString(),
      cleaningBufferMinutes: this.cleaningBufferMinutes,
      nights: stay.nights,
      categories: categoryViews,
    };
  }

  async getAdminAvailability(
    checkInStr: string,
    checkOutStr: string,
    options?: { excludeBookingId?: string },
  ) {
    const stay = this.validateQuery(checkInStr, checkOutStr);

    const categories = await this.prisma.roomCategory.findMany({
      orderBy: { code: 'asc' },
    });

    const bookable = await this.resolveBookableRooms();
    const available = await this.annotateRemaining(
      bookable,
      stay.checkIn,
      stay.checkOut,
      undefined,
      options,
    );

    const categoryViews: CategoryAvailabilityView[] = categories.map(
      (cat) => {
        const rooms = this.sortByCottageThenNumber(
          available.filter((r) => r.categoryCode === cat.code),
        );
        return {
          id: cat.id,
          code: cat.code,
          name: cat.name,
          depositPercent: cat.depositPercent,
          availableBeds: rooms.reduce((sum, r) => sum + r.remainingBeds, 0),
          availableRoomsCount: rooms.length,
          availableRooms: rooms.map((r) => this.toRoomView(r)),
        };
      },
    );

    return {
      checkIn: stay.checkInStr,
      checkOut: stay.checkOutStr,
      checkInTime: stay.checkInTime,
      checkOutTime: stay.checkOutTime,
      checkInAt: stay.checkIn.toISOString(),
      checkOutAt: stay.checkOut.toISOString(),
      cleaningBufferMinutes: this.cleaningBufferMinutes,
      nights: stay.nights,
      categories: categoryViews,
    };
  }

  /**
   * Available rooms for a category with remainingBeds >= guests.
   */
  async listAvailableRoomsForGuests(
    checkInStr: string,
    checkOutStr: string,
    categoryCode: string,
    guests: number,
  ): Promise<AvailableRoomView[]> {
    const stay = this.validateQuery(checkInStr, checkOutStr);
    const bookable = await this.resolveBookableRooms({
      categoryCode: categoryCode.toLowerCase(),
      minCapacity: guests,
    });
    const available = await this.annotateRemaining(
      bookable,
      stay.checkIn,
      stay.checkOut,
      guests,
    );
    return this.sortByCottageThenNumber(available).map((r) =>
      this.toRoomView(r),
    );
  }

  /** @deprecated Prefer assertRoomAcceptsGuests — kept for lock overlap helpers. */
  locksOverlapStay(
    checkIn: Date,
    checkOut: Date,
    locks: Array<{ checkIn: Date; checkOut: Date }>,
  ): boolean {
    return hasOverlappingLock(checkIn, checkOut, locks);
  }

  private toRoomView(
    r: RoomWithPrice & { remainingBeds: number },
  ): AvailableRoomView {
    return {
      id: r.id,
      number: r.number,
      capacity: r.capacity,
      remainingBeds: r.remainingBeds,
      categoryCode: r.categoryCode,
      cottageId: r.cottageId,
      cottageName: r.cottageName,
      pricePerNight: decimalToString(r.pricePerNight),
    };
  }
}
