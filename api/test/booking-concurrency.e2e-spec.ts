/**
 * Concurrency gate (§5.4): 20 parallel POST /api/v1/bookings for the last free room
 * → exactly 1 success, 19 × 409, no overlapping active booking_rooms in DB.
 *
 * Requires PostgreSQL (DATABASE_URL) with seeded inventory.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(120_000);

describe('POST /api/v1/bookings concurrency (gate)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const checkIn = '2030-06-01';
  const checkOut = '2030-06-05';

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true, logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    const logger = app.get(Logger);
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean any bookings that touch the test window on any room
    const conflicting = await prisma.bookingRoom.findMany({
      where: {
        checkIn: { lt: new Date(checkOut) },
        checkOut: { gt: new Date(checkIn) },
      },
      select: { bookingId: true },
    });
    const ids = [...new Set(conflicting.map((r) => r.bookingId))];
    if (ids.length > 0) {
      await prisma.bookingRoom.deleteMany({
        where: { bookingId: { in: ids } },
      });
      await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.auditLog.deleteMany({
        where: { entity: 'booking', entityId: { in: ids } },
      });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('exactly one of 20 parallel bookings succeeds; rest are 409; no DB overlaps', async () => {
    const room = await prisma.room.findFirst({
      where: { number: '401', isActive: true },
    });
    expect(room).toBeTruthy();

    const payload = {
      firstName: 'Race',
      lastName: 'Test',
      phone: '+998901111111',
      roomId: room!.id,
      checkIn,
      checkOut,
      guests: 2,
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/v1/bookings')
          .send({
            ...payload,
            phone: `+99890${String(1000000 + i).slice(0, 7)}`,
            firstName: `Race${i}`,
          })
          .then((res) => ({ status: res.status, body: res.body }))
          .catch((err: { status?: number; response?: { status?: number } }) => ({
            status: err.status ?? err.response?.status ?? 500,
            body: err,
          })),
      ),
    );

    const successes = results.filter((r) => r.status === 201 || r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    const others = results.filter(
      (r) => r.status !== 201 && r.status !== 200 && r.status !== 409,
    );

    if (others.length > 0) {
      // Helpful failure output
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
        checkIn: { lt: new Date(checkOut) },
        checkOut: { gt: new Date(checkIn) },
      },
      include: { booking: true },
    });

    // Only non-expired occupying rows
    const occupying = activeRows.filter((row) => {
      const b = row.booking;
      if (b.status === BookingStatus.cancelled) {
        return false;
      }
      if (b.status === BookingStatus.checked_out) {
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

    expect(occupying).toHaveLength(1);

    // DB exclusion: no two active overlapping rows for this room
    const allActive = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM booking_rooms br1
      INNER JOIN booking_rooms br2
        ON br1.room_id = br2.room_id
        AND br1.id < br2.id
        AND br1.is_active
        AND br2.is_active
        AND br1.stay && br2.stay
      WHERE br1.room_id = ${room!.id}::uuid
    `;
    expect(Number(allActive[0].cnt)).toBe(0);
  });
});
