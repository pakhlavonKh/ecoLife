/**
 * Transfer racing a new booking for the same target beds (TRANSFER.md §4 gate).
 * Room capacity 7; seed booking holds 2 beds on room 201 for the full window.
 * Mover booking lives on room 202 (5 beds) and transfers onto 201 mid-stay.
 * 20 parallel: 1 transfer + 19 public bookings for 5 beds on 201 → at most one
 * 5-bed acquisition succeeds; never over capacity 7.
 *
 * Requires PostgreSQL (DATABASE_URL) with seeded inventory.
 */
import { INestApplication } from '@nestjs/common';
import { ActorType, BookingStatus } from '@prisma/client';
import request from 'supertest';
import { maxOccupiedOverStay } from '../src/availability/occupancy';
import { parseLocalDateTime } from '../src/common/utils/datetime';
import { BookingsService } from '../src/bookings/bookings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './e2e-app';

jest.setTimeout(120_000);

describe('transfer vs new booking concurrency (TRANSFER Phase 2 gate)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bookings: BookingsService;

  const checkIn = '2030-07-01';
  const checkOut = '2030-07-05';
  const transferDate = '2030-07-03';
  const checkInAt = parseLocalDateTime(checkIn, '14:00');
  const checkOutAt = parseLocalDateTime(checkOut, '12:00');
  const transferAt = parseLocalDateTime(transferDate, '14:00');
  const capacity = 7;
  const seedBeds = 2;
  const moveBeds = 5;
  const bufferMinutes = 60;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    bookings = app.get(BookingsService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function cleanupRooms(roomIds: string[]) {
    const conflicting = await prisma.bookingRoom.findMany({
      where: {
        roomId: { in: roomIds },
        checkIn: { lt: checkOutAt },
        checkOut: { gt: checkInAt },
      },
      select: { bookingId: true },
    });
    const ids = [...new Set(conflicting.map((r) => r.bookingId))];
    if (ids.length > 0) {
      await prisma.roomLock.deleteMany({
        where: { bookingId: { in: ids } },
      });
      await prisma.bookingRoom.deleteMany({
        where: { bookingId: { in: ids } },
      });
      await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.auditLog.deleteMany({
        where: { entity: 'booking', entityId: { in: ids } },
      });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.roomLock.deleteMany({
      where: {
        roomId: { in: roomIds },
        checkIn: { lt: checkOutAt },
        checkOut: { gt: checkInAt },
      },
    });
  }

  beforeEach(async () => {
    const rooms = await prisma.room.findMany({
      where: { number: { in: ['201', '202'] }, isActive: true },
    });
    await cleanupRooms(rooms.map((r) => r.id));
  });

  it('transfer racing 19×5-bed bookings onto same room → never over capacity', async () => {
    const room201 = await prisma.room.findFirst({
      where: { number: '201', isActive: true, capacity },
    });
    const room202 = await prisma.room.findFirst({
      where: { number: '202', isActive: true, capacity },
    });
    expect(room201).toBeTruthy();
    expect(room202).toBeTruthy();

    const ensureCustomer = async (phone: string, first: string) => {
      let c = await prisma.customer.findFirst({ where: { phone } });
      if (!c) {
        c = await prisma.customer.create({
          data: { firstName: first, lastName: 'Race', phone },
        });
      }
      return c;
    };

    const seedCustomer = await ensureCustomer('+998909990101', 'Seed');
    await prisma.booking.create({
      data: {
        publicCode: `BK-T${Date.now().toString(36).slice(-4).toUpperCase()}`,
        customerId: seedCustomer.id,
        checkIn: checkInAt,
        checkOut: checkOutAt,
        bedsTotal: seedBeds,
        adults: seedBeds,
        children: 0,
        infants: 0,
        priceOriginal: '100.00',
        totalAmount: '100.00',
        depositAmount: '30.00',
        paidAmount: '0.00',
        remainingAmount: '100.00',
        status: BookingStatus.confirmed,
        bookingRooms: {
          create: {
            roomId: room201!.id,
            bedsBooked: seedBeds,
            checkIn: checkInAt,
            checkOut: checkOutAt,
            isActive: true,
            segmentIndex: 0,
          },
        },
      },
    });

    const moverCustomer = await ensureCustomer('+998909990102', 'Mover');
    const mover = await prisma.booking.create({
      data: {
        publicCode: `BK-M${Date.now().toString(36).slice(-4).toUpperCase()}`,
        customerId: moverCustomer.id,
        checkIn: checkInAt,
        checkOut: checkOutAt,
        bedsTotal: moveBeds,
        adults: moveBeds,
        children: 0,
        infants: 0,
        priceOriginal: '500.00',
        totalAmount: '500.00',
        depositAmount: '150.00',
        paidAmount: '150.00',
        remainingAmount: '350.00',
        status: BookingStatus.confirmed,
        bookingRooms: {
          create: {
            roomId: room202!.id,
            bedsBooked: moveBeds,
            checkIn: checkInAt,
            checkOut: checkOutAt,
            isActive: true,
            segmentIndex: 0,
            amount: '500.00',
          },
        },
      },
    });

    const actor = { type: ActorType.admin, id: '00000000-0000-4000-8000-000000000001' };

    const transferPromise = bookings
      .transferBooking(
        mover.id,
        {
          roomId: room201!.id,
          transferDate,
          transferTime: '14:00',
        },
        actor,
      )
      .then(() => ({ kind: 'transfer' as const, ok: true }))
      .catch((err: { status?: number; statusCode?: number }) => ({
        kind: 'transfer' as const,
        ok: false,
        status: err.status ?? err.statusCode ?? 500,
      }));

    const bookingPromises = Array.from({ length: 19 }, (_, i) =>
      request(app.getHttpServer())
        .post('/api/v1/bookings')
        .send({
          firstName: `Race${i}`,
          lastName: 'Test',
          phone: `+99891${String(2000000 + i).slice(0, 7)}`,
          roomId: room201!.id,
          checkIn: transferDate,
          checkOut,
          checkInTime: '14:00',
          checkOutTime: '12:00',
          adults: moveBeds,
          children: 0,
          infants: 0,
        })
        .then((res) => ({
          kind: 'booking' as const,
          status: res.status,
        }))
        .catch(
          (err: { status?: number; response?: { status?: number } }) => ({
            kind: 'booking' as const,
            status: err.status ?? err.response?.status ?? 500,
          }),
        ),
    );

    const results = await Promise.all([transferPromise, ...bookingPromises]);

    const transferResult = results.find((r) => r.kind === 'transfer')!;
    const bookingResults = results.filter((r) => r.kind === 'booking') as Array<{
      kind: 'booking';
      status: number;
    }>;

    const bookingWins = bookingResults.filter(
      (r) => r.status === 201 || r.status === 200,
    );
    const bookingConflicts = bookingResults.filter((r) => r.status === 409);
    const bookingOthers = bookingResults.filter(
      (r) => r.status !== 201 && r.status !== 200 && r.status !== 409,
    );

    expect(bookingOthers).toHaveLength(0);

    // Exactly one of: transfer OK, or one public booking OK — never both for 5 beds
    // (seed already holds 2; only 5 free).
    const transferOk = transferResult.ok === true;
    const totalFiveBedWins = (transferOk ? 1 : 0) + bookingWins.length;
    expect(totalFiveBedWins).toBe(1);
    expect(bookingWins.length + bookingConflicts.length).toBe(19);
    if (transferOk) {
      expect(bookingWins).toHaveLength(0);
      expect(bookingConflicts).toHaveLength(19);
    } else {
      expect(bookingWins).toHaveLength(1);
      expect(bookingConflicts).toHaveLength(18);
    }

    // Peak occupancy on 201 over [transferAt, checkOut) never exceeds capacity
    const activeRows = await prisma.bookingRoom.findMany({
      where: {
        roomId: room201!.id,
        isActive: true,
        checkIn: { lt: checkOutAt },
        checkOut: { gt: transferAt },
      },
      include: { booking: true },
    });

    const occupying = activeRows.filter((row) => {
      const b = row.booking;
      if (
        b.status === BookingStatus.cancelled ||
        b.status === BookingStatus.checked_out
      ) {
        return false;
      }
      if (b.status === BookingStatus.pending_payment) {
        return !b.expiresAt || b.expiresAt > new Date();
      }
      return (
        b.status === BookingStatus.deposit_paid ||
        b.status === BookingStatus.confirmed ||
        b.status === BookingStatus.checked_in
      );
    });

    const stays = occupying.map((r) => ({
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      beds: r.bedsBooked,
      skipCleaningBuffer: r.skipCleaningBuffer,
    }));
    expect(
      maxOccupiedOverStay(transferAt, checkOutAt, stays, bufferMinutes),
    ).toBeLessThanOrEqual(capacity);

    const peakBeds = maxOccupiedOverStay(
      transferAt,
      checkOutAt,
      stays,
      bufferMinutes,
    );
    expect(peakBeds).toBe(seedBeds + moveBeds);
  });
});
