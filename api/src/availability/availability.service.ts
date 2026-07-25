import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  validateStayDates,
  type ValidatedStay,
} from '../common/utils/dates';
import { decimalToString } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';

export type AvailableRoomView = {
  id: string;
  number: string;
  capacity: number;
  categoryCode: string;
  cottageId: string;
  cottageName: string;
  pricePerNight: string;
};

export type CategoryAvailabilityView = {
  id: string;
  code: string;
  name: string;
  depositPercent: number;
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
  pricePerNight: Decimal;
};

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  validateQuery(checkIn: string, checkOut: string): ValidatedStay {
    return validateStayDates(checkIn, checkOut, {
      minNights: Number(this.config.get('MIN_STAY_NIGHTS') ?? 1),
      maxNights: Number(this.config.get('MAX_STAY_NIGHTS') ?? 30),
    });
  }

  /**
   * Rooms that currently occupy inventory for [checkIn, checkOut).
   * Expired pending_payment holds are ignored even before the worker runs.
   */
  async findOccupiedRoomIds(
    checkIn: Date,
    checkOut: Date,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
    options?: { excludeBookingId?: string },
  ): Promise<Set<string>> {
    const excludeId = options?.excludeBookingId ?? null;
    const rows = await tx.$queryRaw<{ room_id: string }[]>`
      SELECT DISTINCT br.room_id
      FROM booking_rooms br
      INNER JOIN bookings b ON b.id = br.booking_id
      WHERE br.is_active = true
        AND br.check_in < ${checkOut}::date
        AND br.check_out > ${checkIn}::date
        AND (
          b.status <> ${BookingStatus.pending_payment}::booking_status
          OR b.expires_at IS NULL
          OR b.expires_at > NOW()
        )
        AND (${excludeId}::uuid IS NULL OR b.id <> ${excludeId}::uuid)
    `;
    return new Set(rows.map((r) => r.room_id));
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
      orderBy: [{ capacity: 'asc' }, { number: 'asc' }],
    });

    const tiers = await this.prisma.priceTier.findMany();
    const tierMap = new Map(
      tiers.map((t) => [`${t.categoryId}:${t.capacity}`, t.pricePerNight]),
    );

    const result: RoomWithPrice[] = [];
    for (const room of rooms) {
      const override = room.priceOverride;
      const tierPrice = tierMap.get(`${room.categoryId}:${room.capacity}`);
      const price = override ?? tierPrice ?? null;
      if (price === null) {
        continue; // non-bookable until a price exists
      }
      result.push({
        id: room.id,
        number: room.number,
        capacity: room.capacity,
        categoryId: room.categoryId,
        categoryCode: room.category.code,
        cottageId: room.cottageId,
        cottageName: room.cottage.name,
        pricePerNight: price,
      });
    }
    return result;
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

  async getPublicAvailability(
    checkInStr: string,
    checkOutStr: string,
    opts?: { categoryCode?: string; guests?: number },
  ) {
    const stay = this.validateQuery(checkInStr, checkOutStr);
    const occupied = await this.findOccupiedRoomIds(
      stay.checkIn,
      stay.checkOut,
    );

    const categories = await this.prisma.roomCategory.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });

    const bookable = await this.resolveBookableRooms({
      categoryCode: opts?.categoryCode,
      minCapacity: opts?.guests,
    });

    const available = bookable.filter((r) => !occupied.has(r.id));

    const includeRooms =
      opts?.categoryCode != null && opts?.guests != null;

    const categoryViews: CategoryAvailabilityView[] = categories
      .filter((c) =>
        opts?.categoryCode
          ? c.code === opts.categoryCode.toLowerCase()
          : true,
      )
      .map((cat) => {
        const rooms = this.sortBestFit(
          available.filter((r) => r.categoryCode === cat.code),
        );
        const view: CategoryAvailabilityView = {
          id: cat.id,
          code: cat.code,
          name: cat.name,
          depositPercent: cat.depositPercent,
          availableBeds: rooms.reduce((sum, r) => sum + r.capacity, 0),
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
      nights: stay.nights,
      categories: categoryViews,
    };
  }

  async getAdminAvailability(checkInStr: string, checkOutStr: string) {
    const stay = this.validateQuery(checkInStr, checkOutStr);
    const occupied = await this.findOccupiedRoomIds(
      stay.checkIn,
      stay.checkOut,
    );

    const categories = await this.prisma.roomCategory.findMany({
      orderBy: { code: 'asc' },
    });

    const bookable = await this.resolveBookableRooms();
    // Admin sees all active rooms with price; still exclude occupied
    const available = bookable.filter((r) => !occupied.has(r.id));

    const categoryViews: CategoryAvailabilityView[] = categories.map(
      (cat) => {
        const rooms = this.sortBestFit(
          available.filter((r) => r.categoryCode === cat.code),
        );
        return {
          id: cat.id,
          code: cat.code,
          name: cat.name,
          depositPercent: cat.depositPercent,
          availableBeds: rooms.reduce((sum, r) => sum + r.capacity, 0),
          availableRoomsCount: rooms.length,
          availableRooms: rooms.map((r) => this.toRoomView(r)),
        };
      },
    );

    return {
      checkIn: stay.checkInStr,
      checkOut: stay.checkOutStr,
      nights: stay.nights,
      categories: categoryViews,
    };
  }

  /**
   * Available rooms for a category with capacity >= guests (best-fit order).
   */
  async listAvailableRoomsForGuests(
    checkInStr: string,
    checkOutStr: string,
    categoryCode: string,
    guests: number,
  ): Promise<AvailableRoomView[]> {
    const stay = this.validateQuery(checkInStr, checkOutStr);
    const occupied = await this.findOccupiedRoomIds(
      stay.checkIn,
      stay.checkOut,
    );
    const bookable = await this.resolveBookableRooms({
      categoryCode: categoryCode.toLowerCase(),
      minCapacity: guests,
    });
    return this.sortBestFit(bookable.filter((r) => !occupied.has(r.id))).map(
      (r) => this.toRoomView(r),
    );
  }

  isRoomFree(
    roomId: string,
    occupied: Set<string>,
  ): boolean {
    return !occupied.has(roomId);
  }

  private toRoomView(r: RoomWithPrice): AvailableRoomView {
    return {
      id: r.id,
      number: r.number,
      capacity: r.capacity,
      categoryCode: r.categoryCode,
      cottageId: r.cottageId,
      cottageName: r.cottageName,
      pricePerNight: decimalToString(r.pricePerNight),
    };
  }
}
