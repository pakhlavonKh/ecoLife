import { BookingStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type PaymentProviderName = 'mock' | 'payme' | 'click';

export type InvoiceBooking = {
  id: string;
  publicCode: string;
  depositAmount: Decimal;
  expiresAt: Date | null;
  status: BookingStatus;
};

export type CreateInvoiceResult = {
  url: string;
  invoiceId: string;
};

export type ProviderWebhookContext = {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  query?: Record<string, unknown>;
};

export type NormalizedWebhookEvent = {
  type: 'payment.succeeded' | 'payment.failed' | 'noop';
  providerTxnId: string;
  /** Our Payment.id when known (merchant reference). */
  paymentId?: string;
  amountUzs?: string;
  raw: unknown;
};

export type ProviderWebhookResult = {
  /** Body returned to the payment provider (JSON / plain). */
  responseBody: unknown;
  httpStatus?: number;
  contentType?: string;
  event?: NormalizedWebhookEvent;
};

/**
 * PaymentProvider — adapters implement this contract (§7).
 * createInvoice → checkout URL; verifySignature + handleWebhook for provider callbacks.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;

  createInvoice(
    booking: InvoiceBooking,
    paymentId: string,
  ): Promise<CreateInvoiceResult>;

  verifySignature(req: ProviderWebhookContext): boolean;

  handleWebhook(req: ProviderWebhookContext): Promise<ProviderWebhookResult>;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
