/**
 * Bed-mode concurrency gate (HOURLY.md §4 / Phase 2):
 * Room capacity 7, 2 beds already taken; 20 parallel bookings each request 5 beds
 * → exactly 1 success, 19 × 409; no instant exceeds capacity 7 (with cleaning buffer).
 *
 * Requires PostgreSQL (DATABASE_URL) with seeded inventory.
 */
import { INestApplication } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import request from 'supertest';
import { maxOccupiedOverStay } from '../src/availability/occupancy';
import { parseLocalDateTime } from '../src/common/utils/datetime';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './e2e-app';

jest.setTimeout(120_000);

describe('POST /api/v1/bookings bed-mode concurrency (gate)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const checkIn = '2030-06-01';
  const checkOut = '2030-06-05';
  // Stays are TIMESTAMPTZ; the API applies the default local times to these dates.
  const checkInAt = parseLocalDateTime(checkIn, '14:00');
  const checkOutAt = parseLocalDateTime(checkOut, '12:00');
  const capacity = 7;
  const seedBeds = 2;
  const requestBeds = 5;
  const bufferMinutes = 60;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function cleanupWindow(roomId: string) {
    const conflicting = await prisma.bookingRoom.findMany({
      where: {
        roomId,
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
        roomId,
        checkIn: { lt: checkOutAt },
        checkOut: { gt: checkInAt },
      },
    });
  }

  beforeEach(async () => {
    const room = await prisma.room.findFirst({
      where: { number: '201', isActive: true },
    });
    if (room) {
      await cleanupWindow(room.id);
    }
  });

  it('20 parallel 5-bed requests with 2 already taken → 1 win, never over capacity', async () => {
    const room = await prisma.room.findFirst({
      where: { number: '201', isActive: true, capacity },
    });
    expect(room).toBeTruthy();
    expect(room!.capacity).toBe(capacity);

    // Seed occupying booking: 2 beds, confirmed (no room_lock — sharing allowed)
    const seedPhone = '+998909990001';
    let customer = await prisma.customer.findFirst({
      where: { phone: seedPhone },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          firstName: 'Seed',
          lastName: 'Occupant',
          phone: seedPhone,
        },
      });
    }
    const seedCode = `BK-S${Date.now().toString(36).slice(-4).toUpperCase()}`;
    await prisma.booking.create({
      data: {
        publicCode: seedCode,
        customerId: customer.id,
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
            roomId: room!.id,
            bedsBooked: seedBeds,
            checkIn: checkInAt,
            checkOut: checkOutAt,
            isActive: true,
          },
        },
      },
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/v1/bookings')
          .send({
            firstName: `Race${i}`,
            lastName: 'Test',
            phone: `+99890${String(1000000 + i).slice(0, 7)}`,
            roomId: room!.id,
            checkIn,
            checkOut,
            adults: requestBeds,
            children: 0,
            infants: 0,
          })
          .then((res) => ({ status: res.status, body: res.body }))
          .catch(
            (err: { status?: number; response?: { status?: number } }) => ({
              status: err.status ?? err.response?.status ?? 500,
              body: err,
            }),
          ),
      ),
    );

    const successes = results.filter(
      (r) => r.status === 201 || r.status === 200,
    );
    const conflicts = results.filter((r) => r.status === 409);
    const others = results.filter(
      (r) => r.status !== 201 && r.status !== 200 && r.status !== 409,
    );

    if (others.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        'Unexpected statuses:',
        others.map((o) => ({ status: o.status, body: o.body })),
      );
    }

    expect(others).toHaveLength(0);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(19);

    const activeRows = await prisma.bookingRoom.findMany({
      where: {
        roomId: room!.id,
        isActive: true,
        checkIn: { lt: checkOutAt },
        checkOut: { gt: checkInAt },
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

    const totalBeds = occupying.reduce((sum, r) => sum + r.bedsBooked, 0);
    expect(totalBeds).toBe(seedBeds + requestBeds);
    expect(totalBeds).toBeLessThanOrEqual(capacity);

    // No instant over capacity (effective intervals incl. cleaning buffer)
    const stays = occupying.map((r) => ({
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      beds: r.bedsBooked,
    }));
    expect(
      maxOccupiedOverStay(checkInAt, checkOutAt, stays, bufferMinutes),
    ).toBeLessThanOrEqual(capacity);
  });
});
