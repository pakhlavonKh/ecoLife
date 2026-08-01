import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType, Prisma } from '@prisma/client';
import { AvailabilityService } from '../availability/availability.service';
import {
  formatLocalDate,
  formatLocalTime,
  parseLocalDateTime,
} from '../common/utils/datetime';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomLockDto } from './dto/create-room-lock.dto';
import {
  ROOM_LOCK_CREATED_EVENT,
  RoomLockCreatedPayload,
} from './events/room-lock.events';

function isLockExclusion(error: unknown): boolean {
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
    msg.includes('room_locks_no_overlap') ||
    msg.includes('23P01') ||
    msg.includes('exclusion')
  );
}

@Injectable()
export class RoomLocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly events: EventEmitter2,
  ) {}

  async list(params: {
    from?: string;
    to?: string;
    roomId?: string;
    bookingId?: string;
  }) {
    const where: Prisma.RoomLockWhereInput = {};
    if (params.roomId) {
      where.roomId = params.roomId;
    }
    if (params.bookingId) {
      where.bookingId = params.bookingId;
    }
    if (params.from || params.to) {
      const from = params.from
        ? parseLocalDateTime(params.from, undefined, 'from')
        : undefined;
      const to = params.to
        ? parseLocalDateTime(params.to, undefined, 'to')
        : undefined;
      where.AND = [
        ...(from ? [{ checkOut: { gt: from } }] : []),
        ...(to ? [{ checkIn: { lt: to } }] : []),
      ];
    }

    const rows = await this.prisma.roomLock.findMany({
      where,
      include: { room: true },
      orderBy: [{ checkIn: 'asc' }, { room: { number: 'asc' } }],
    });

    return rows.map((lock) => ({
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
      createdAt: lock.createdAt,
    }));
  }

  /**
   * Whole-room lock: FOR UPDATE room row → refuse if other beds booked → insert.
   * When bookingId is set, that booking's own beds are ignored (lock closes the rest).
   */
  async create(
    dto: CreateRoomLockDto,
    actor: { type: ActorType; id: string },
  ) {
    const stay = this.availability.validateQuery(dto.checkIn, dto.checkOut, {
      checkInTime: dto.checkInTime,
      checkOutTime: dto.checkOutTime,
      allowPast: true,
    });

    try {
      const lock = await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM rooms WHERE id = ${dto.roomId}::uuid FOR UPDATE
          `;
          if (locked.length === 0) {
            throw new NotFoundException('Room not found');
          }

          const room = await tx.room.findUnique({
            where: { id: dto.roomId },
            include: { cottage: true, category: true },
          });
          if (!room || !room.isActive) {
            throw new BadRequestException('Room is not available');
          }

          if (dto.bookingId) {
            const booking = await tx.booking.findUnique({
              where: { id: dto.bookingId },
            });
            if (!booking) {
              throw new NotFoundException('Booking not found');
            }
          }

          await this.availability.assertRoomHasNoBookedBeds(
            room.id,
            stay.checkIn,
            stay.checkOut,
            tx,
            { excludeBookingId: dto.bookingId },
          );

          const existingLocks = await this.availability.findLockedRoomIds(
            stay.checkIn,
            stay.checkOut,
            tx,
            { roomIds: [room.id] },
          );
          if (existingLocks.has(room.id)) {
            throw new ConflictException(
              'номер уже закрыт на пересекающиеся даты',
            );
          }

          const created = await tx.roomLock.create({
            data: {
              roomId: room.id,
              bookingId: dto.bookingId ?? null,
              checkIn: stay.checkIn,
              checkOut: stay.checkOut,
              reason: dto.reason?.trim() || null,
              createdById: actor.id,
            },
          });

          await tx.auditLog.create({
            data: {
              actorType: actor.type,
              actorId: actor.id,
              entity: 'room_lock',
              entityId: created.id,
              action: 'create',
              diff: {
                after: {
                  roomId: room.id,
                  roomNumber: room.number,
                  checkIn: stay.checkInStr,
                  checkOut: stay.checkOutStr,
                  reason: created.reason,
                  bookingId: created.bookingId,
                },
              },
            },
          });

          return { lock: created, room };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );

      const payload: RoomLockCreatedPayload = {
        lockId: lock.lock.id,
        roomId: lock.lock.roomId,
        roomNumber: lock.room.number,
        cottageName: lock.room.cottage.name,
        checkIn: formatLocalDate(lock.lock.checkIn),
        checkOut: formatLocalDate(lock.lock.checkOut),
        checkInTime: formatLocalTime(lock.lock.checkIn),
        checkOutTime: formatLocalTime(lock.lock.checkOut),
        reason: lock.lock.reason,
        bookingId: lock.lock.bookingId,
      };
      this.events.emit(ROOM_LOCK_CREATED_EVENT, payload);

      return {
        id: lock.lock.id,
        roomId: lock.lock.roomId,
        roomNumber: lock.room.number,
        bookingId: lock.lock.bookingId,
        checkIn: formatLocalDate(lock.lock.checkIn),
        checkOut: formatLocalDate(lock.lock.checkOut),
        checkInTime: formatLocalTime(lock.lock.checkIn),
        checkOutTime: formatLocalTime(lock.lock.checkOut),
        checkInAt: lock.lock.checkIn.toISOString(),
        checkOutAt: lock.lock.checkOut.toISOString(),
        reason: lock.lock.reason,
        createdAt: lock.lock.createdAt,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (isLockExclusion(error)) {
        throw new ConflictException(
          'номер уже закрыт на пересекающиеся даты',
        );
      }
      throw error;
    }
  }
}
