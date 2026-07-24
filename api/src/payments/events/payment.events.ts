/** Domain events for payments (Telegram listens in Phase 7). */

export const PAYMENT_RECEIVED_EVENT = 'payment.received';
export const PAYMENT_LATE_MANUAL_REVIEW_EVENT = 'payment.late_manual_review';
export const PAYMENT_FAILED_EVENT = 'payment.failed';

export type PaymentReceivedPayload = {
  bookingId: string;
  paymentId: string;
  publicCode: string;
  provider: string;
  amount: string;
  providerTxnId: string;
};

export type PaymentLateManualReviewPayload = {
  bookingId: string;
  paymentId: string;
  publicCode: string;
  provider: string;
  amount: string;
  providerTxnId: string;
  bookingStatus: string;
  reason: string;
};

export type PaymentFailedPayload = {
  bookingId: string;
  paymentId: string;
  publicCode: string;
  provider: string;
  reason?: string;
};
