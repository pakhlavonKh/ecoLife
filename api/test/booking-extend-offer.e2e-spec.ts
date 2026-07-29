/**
 * Extend blocked → transfer offers (TRANSFER.md §4).
 * Seeds a confirmed booking and a blocker that occupies the same room after
 * the original checkout, then asserts extend returns 409 + offers.
 */
import { INestApplication } from '@nestjs/common';
import { ActorType, BookingStatus } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { parseLocalDateTime } from '../src/common/utils/datetime';
import { BookingsService } from '../src/bookings/bookings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './e2e-app';

jest.setTimeout(120_000);

describe('extend blocked → transfer offer (TRANSFER Phase 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bookings: BookingsService;

  const checkIn = '2030-08-01';
  const checkOut = '2030-08-03';
  const blockedUntil = '2030-08-07';
  const checkInAt = parseLocalDateTime(checkIn, '14:00');
  const checkOutAt = parseLocalDateTime(checkOut, '12:00');
  const blockedUntilAt = parseLocalDateTime(blockedUntil, '12:00');

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    bookings = app.get(BookingsService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function cleanupRoom(roomId: string) {
    const conflicting = await prisma.bookingRoom.findMany({
      where: {
        roomId,
        checkIn: { lt: blockedUntilAt },
        checkOut: { gt: checkInAt },
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
  }

  it('returns EXTEND_BLOCKED with same-class transferOffers', async () => {
    const room = await prisma.room.findFirst({
      where: { number: '201', isActive: true, capacity: 7 },
      include: { category: true },
    });
    expect(room).toBeTruthy();
    await cleanupRoom(room!.id);

    const ensureCustomer = async (phone: string, first: string) => {
      let c = await prisma.customer.findFirst({ where: { phone } });
      if (!c) {
        c = await prisma.customer.create({
          data: { firstName: first, lastName: 'Ext', phone },
        });
      }
      return c;
    };

    const guest = await ensureCustomer('+998909990201', 'Guest');
    const booking = await prisma.booking.create({
      data: {
        publicCode: `BK-E${Date.now().toString(36).slice(-4).toUpperCase()}`,
        customerId: guest.id,
        checkIn: checkInAt,
        checkOut: checkOutAt,
        bedsTotal: 5,
        adults: 5,
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
            roomId: room!.id,
            bedsBooked: 5,
            checkIn: checkInAt,
            checkOut: checkOutAt,
            isActive: true,
            segmentIndex: 0,
            amount: '500.00',
          },
        },
      },
    });

    // Blocker takes remaining 2 + enough that 5 cannot fit after checkout
    // Room cap 7; after guest leaves at checkOut, if blocker holds 5 beds
    // overlapping the extension window, extend of 5 fails.
    const blocker = await ensureCustomer('+998909990202', 'Blocker');
    await prisma.booking.create({
      data: {
        publicCode: `BK-B${Date.now().toString(36).slice(-4).toUpperCase()}`,
        customerId: blocker.id,
        checkIn: checkOutAt,
        checkOut: blockedUntilAt,
        bedsTotal: 5,
        adults: 5,
        children: 0,
        infants: 0,
        priceOriginal: '500.00',
        totalAmount: '500.00',
        depositAmount: '150.00',
        paidAmount: '0.00',
        remainingAmount: '500.00',
        status: BookingStatus.confirmed,
        bookingRooms: {
          create: {
            roomId: room!.id,
            bedsBooked: 5,
            checkIn: checkOutAt,
            checkOut: blockedUntilAt,
            isActive: true,
            segmentIndex: 0,
          },
        },
      },
    });

    const actor = {
      type: ActorType.admin,
      id: '00000000-0000-4000-8000-000000000001',
    };

    try {
      await bookings.extendBooking(
        booking.id,
        { newCheckOut: blockedUntil, newCheckOutTime: '12:00' },
        actor,
      );
      fail('expected ConflictException');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const body = (e as ConflictException).getResponse() as {
        message?: string;
        code?: string;
        transferOffers?: Array<{ id: string; categoryCode: string }>;
      };
      // Nest may wrap as { message: { code, transferOffers, ... }, statusCode }
      const payload =
        typeof body.message === 'object' && body.message !== null
          ? (body.message as {
              code?: string;
              transferOffers?: Array<{ id: string; categoryCode: string }>;
            })
          : body;
      expect(payload.code).toBe('EXTEND_BLOCKED');
      expect(Array.isArray(payload.transferOffers)).toBe(true);
      expect((payload.transferOffers ?? []).length).toBeGreaterThan(0);
      expect(
        (payload.transferOffers ?? []).every(
          (o) => o.categoryCode === room!.category.code,
        ),
      ).toBe(true);
      expect(
        (payload.transferOffers ?? []).every((o) => o.id !== room!.id),
      ).toBe(true);
    }
  });
});
