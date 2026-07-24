import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BookingStatus,
  PaymentRecordStatus,
  PaymentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsService } from '../payments.service';
import { PAYMENT_RECEIVED_EVENT } from '../events/payment.events';

/**
 * Idempotency + late-payment behaviour of PaymentsService.applyWebhookEvent
 * (Prisma mocked — no DB required).
 */
describe('PaymentsService.applyWebhookEvent', () => {
  const bookingId = 'booking-1';
  const paymentId = 'payment-1';
  const txnId = 'provider-txn-abc';

  let prisma: {
    payment: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    booking: { update: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let events: { emit: jest.Mock };
  let service: PaymentsService;

  const baseBooking = {
    id: bookingId,
    publicCode: 'BK-TEST',
    status: BookingStatus.pending_payment,
    paymentStatus: PaymentStatus.unpaid,
    totalAmount: new Decimal('1000000.00'),
    depositAmount: new Decimal('300000.00'),
    paidAmount: new Decimal('0'),
    remainingAmount: new Decimal('700000.00'),
    customerId: 'cust-1',
  };

  const basePayment = {
    id: paymentId,
    bookingId,
    provider: 'mock',
    providerTxnId: txnId,
    amount: new Decimal('300000.00'),
    status: PaymentRecordStatus.pending,
    payload: {},
    booking: baseBooking,
  };

  beforeEach(() => {
    prisma = {
      payment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      booking: { update: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) =>
        fn(prisma),
      ),
    };
    events = { emit: jest.fn() };

    service = new PaymentsService(
      prisma as never,
      { get: () => 'mock' } as never,
      events as unknown as EventEmitter2,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('applies deposit once and emits payment.received', async () => {
    prisma.payment.findFirst
      .mockResolvedValueOnce(null) // by txn — not yet succeeded
      .mockResolvedValueOnce(basePayment); // findPaymentRow
    prisma.payment.findUnique.mockResolvedValue(basePayment);

    const first = await service.applyWebhookEvent('mock', {
      type: 'payment.succeeded',
      providerTxnId: txnId,
      paymentId,
      raw: { once: 1 },
    });
    expect(first).toEqual({
      applied: true,
      duplicate: false,
      lateManualReview: false,
    });
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BookingStatus.deposit_paid,
          paymentStatus: PaymentStatus.deposit_paid,
        }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      PAYMENT_RECEIVED_EVENT,
      expect.objectContaining({ bookingId, paymentId, providerTxnId: txnId }),
    );
  });

  it('does not double-apply when provider_txn_id already succeeded', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      ...basePayment,
      status: PaymentRecordStatus.succeeded,
      payload: {},
    });

    const second = await service.applyWebhookEvent('mock', {
      type: 'payment.succeeded',
      providerTxnId: txnId,
      paymentId,
      raw: { once: 2 },
    });

    expect(second.duplicate).toBe(true);
    expect(second.applied).toBe(false);
    expect(prisma.booking.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalledWith(
      PAYMENT_RECEIVED_EVENT,
      expect.anything(),
    );
  });

  it('flags late payment on cancelled booking without changing booking status', async () => {
    const cancelled = {
      ...basePayment,
      booking: { ...baseBooking, status: BookingStatus.cancelled },
    };
    prisma.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cancelled);

    const result = await service.applyWebhookEvent('mock', {
      type: 'payment.succeeded',
      providerTxnId: txnId,
      paymentId,
      raw: { late: true },
    });

    expect(result.lateManualReview).toBe(true);
    expect(result.applied).toBe(true);
    expect(prisma.booking.update).not.toHaveBeenCalled();
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentRecordStatus.succeeded,
          payload: expect.objectContaining({
            latePaymentManualReview: true,
          }),
        }),
      }),
    );
  });
});
