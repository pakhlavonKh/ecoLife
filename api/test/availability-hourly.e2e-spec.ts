/**
 * E2E: public availability accepts snake_case times and uses them for occupancy.
 * Book room 401 for [day 14:00 → next 12:00), then:
 *  - overlapping window → room absent
 *  - earlier non-overlapping window ending before check-in → room present
 *
 * Requires PostgreSQL (DATABASE_URL) with seeded inventory.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './e2e-app';

jest.setTimeout(120_000);

describe('Public availability with hourly times', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const checkIn = '2032-06-10';
  const checkOut = '2032-06-11';

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const conflicting = await prisma.bookingRoom.findMany({
      where: {
        checkIn: { lt: new Date(`${checkOut}T23:59:59+05:00`) },
        checkOut: { gt: new Date(`2032-06-09T00:00:00+05:00`) },
      },
      select: { bookingId: true },
    });
    const ids = [...new Set(conflicting.map((r) => r.bookingId))];
    if (ids.length > 0) {
      await prisma.roomLock.deleteMany({ where: { bookingId: { in: ids } } });
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

  it('accepts check_in_time/check_out_time and applies them to occupancy', async () => {
    const room = await prisma.room.findFirst({
      where: { number: '401', isActive: true },
    });
    expect(room).toBeTruthy();

    // Contract regression: snake_case times must not 400
    const empty = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({
        check_in: checkIn,
        check_out: checkOut,
        check_in_time: '14:00',
        check_out_time: '12:00',
        category_code: 'standart',
        guests: 2,
      });

    expect(empty.status).toBe(200);
    expect(empty.body.checkInTime).toBe('14:00');
    expect(empty.body.checkOutTime).toBe('12:00');
    const beforeIds = (
      empty.body.categories?.[0]?.availableRooms ?? []
    ).map((r: { id: string }) => r.id);
    expect(beforeIds).toContain(room!.id);

    // Occupy with camelCase body times (POST /bookings contract)
    const created = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .send({
        firstName: 'Hourly',
        lastName: 'Guest',
        phone: '+998901112233',
        roomId: room!.id,
        checkIn,
        checkOut,
        checkInTime: '14:00',
        checkOutTime: '12:00',
        adults: 2,
        children: 0,
        infants: 0,
        provider: 'mock',
      });
    expect(created.status).toBe(201);
    expect(created.body.checkInTime).toBe('14:00');
    expect(created.body.checkOutTime).toBe('12:00');

    // Same window → room gone (engine used datetimes, not date-only)
    const overlap = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({
        check_in: checkIn,
        check_out: checkOut,
        check_in_time: '14:00',
        check_out_time: '12:00',
        category_code: 'standart',
        guests: 2,
      });
    expect(overlap.status).toBe(200);
    const overlapIds = (
      overlap.body.categories?.[0]?.availableRooms ?? []
    ).map((r: { id: string }) => r.id);
    expect(overlapIds).not.toContain(room!.id);

    // Ends at 13:00 on check-in day — before occupied 14:00 start → still free
    const early = await request(app.getHttpServer())
      .get('/api/v1/availability')
      .query({
        check_in: '2032-06-09',
        check_out: checkIn,
        check_in_time: '14:00',
        check_out_time: '13:00',
        category_code: 'standart',
        guests: 2,
      });
    expect(early.status).toBe(200);
    expect(early.body.checkOutTime).toBe('13:00');
    const earlyIds = (
      early.body.categories?.[0]?.availableRooms ?? []
    ).map((r: { id: string }) => r.id);
    expect(earlyIds).toContain(room!.id);
  });
});
