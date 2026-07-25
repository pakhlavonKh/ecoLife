/**
 * E2E happy path (§12 Phase 9):
 * book → mock pay → deposit_paid → confirmed → checked_in → checked_out
 * Asserts statuses and money amounts at each step.
 *
 * Requires PostgreSQL (DATABASE_URL) with seeded inventory.
 */
import { INestApplication } from '@nestjs/common';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './e2e-app';

jest.setTimeout(120_000);

describe('Booking happy path (Phase 9)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

  const checkIn = '2031-03-01';
  const checkOut = '2031-03-03';
  /** Seed placeholder: standart × capacity 2 = 1_000_000 UZS / night × 2 nights */
  const expectedTotal = '2000000.00';
  /** deposit_percent = 30 for standart */
  const expectedDeposit = '600000.00';
  const expectedRemaining = '1400000.00';

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);

    const email = process.env.ADMIN_EMAIL ?? 'admin@ecolife.local';
    const password = process.env.ADMIN_PASSWORD ?? 'ChangeMeAdmin123!';
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    accessToken = login.body.tokens.accessToken as string;
    expect(accessToken).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
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

  it('book → mock pay → deposit_paid → check-in → check-out', async () => {
    const room = await prisma.room.findFirst({
      where: { number: '401', isActive: true },
    });
    expect(room).toBeTruthy();

    // 1) Create online booking
    const created = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .send({
        firstName: 'Happy',
        lastName: 'Path',
        phone: '+998901234567',
        roomId: room!.id,
        checkIn,
        checkOut,
        guests: 2,
        provider: 'mock',
      });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe(BookingStatus.pending_payment);
    expect(created.body.paymentStatus).toBe(PaymentStatus.unpaid);
    expect(created.body.totalAmount).toBe(expectedTotal);
    expect(created.body.depositAmount).toBe(expectedDeposit);
    expect(created.body.paidAmount).toBe('0.00');
    expect(created.body.remainingAmount).toBe(expectedRemaining);
    expect(created.body.paymentId).toBeTruthy();
    expect(created.body.publicCode).toMatch(/^BK-/);

    const bookingId = created.body.id as string;
    const paymentId = created.body.paymentId as string;
    const publicCode = created.body.publicCode as string;

    // 2) Mock payment success
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/payments/mock/${paymentId}/succeed`)
      .send();

    expect(paid.status).toBe(200);
    expect(paid.body.ok).toBe(true);
    expect(paid.body.status).toBe('succeeded');

    const afterPay = await request(app.getHttpServer())
      .get(`/api/v1/bookings/by-code/${publicCode}`)
      .send();

    expect(afterPay.status).toBe(200);
    expect(afterPay.body.status).toBe(BookingStatus.deposit_paid);
    expect(afterPay.body.paymentStatus).toBe(PaymentStatus.deposit_paid);
    expect(afterPay.body.totalAmount).toBe(expectedTotal);
    expect(afterPay.body.depositAmount).toBe(expectedDeposit);
    expect(afterPay.body.paidAmount).toBe(expectedDeposit);
    expect(afterPay.body.remainingAmount).toBe(expectedRemaining);

    // 3) Admin: confirm
    const confirmed = await request(app.getHttpServer())
      .patch(`/api/v1/admin/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: BookingStatus.confirmed });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe(BookingStatus.confirmed);
    expect(confirmed.body.paymentStatus).toBe(PaymentStatus.deposit_paid);
    expect(confirmed.body.paidAmount).toBe(expectedDeposit);
    expect(confirmed.body.remainingAmount).toBe(expectedRemaining);

    // 4) Check-in
    const checkedIn = await request(app.getHttpServer())
      .patch(`/api/v1/admin/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: BookingStatus.checked_in });

    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body.status).toBe(BookingStatus.checked_in);
    expect(checkedIn.body.paymentStatus).toBe(PaymentStatus.deposit_paid);
    expect(checkedIn.body.totalAmount).toBe(expectedTotal);
    expect(checkedIn.body.paidAmount).toBe(expectedDeposit);

    // 5) Check-out
    const checkedOut = await request(app.getHttpServer())
      .patch(`/api/v1/admin/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: BookingStatus.checked_out });

    expect(checkedOut.status).toBe(200);
    expect(checkedOut.body.status).toBe(BookingStatus.checked_out);
    expect(checkedOut.body.paymentStatus).toBe(PaymentStatus.deposit_paid);
    expect(checkedOut.body.totalAmount).toBe(expectedTotal);
    expect(checkedOut.body.depositAmount).toBe(expectedDeposit);
    expect(checkedOut.body.paidAmount).toBe(expectedDeposit);
    expect(checkedOut.body.remainingAmount).toBe(expectedRemaining);

    // Inventory released after check-out
    const activeRooms = await prisma.bookingRoom.findMany({
      where: { bookingId, isActive: true },
    });
    expect(activeRooms).toHaveLength(0);
  });
});
