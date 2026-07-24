import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, PaymentRecordStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decimalToString } from '../../common/utils/money';
import {
  CreateInvoiceResult,
  InvoiceBooking,
  PaymentProvider,
  ProviderWebhookContext,
  ProviderWebhookResult,
} from '../payment-provider.interface';
import { verifyClickSignature } from './click.sign';

export const ClickError = {
  Success: 0,
  SignFailed: -1,
  InvalidAmount: -2,
  ActionNotFound: -3,
  AlreadyPaid: -4,
  UserNotFound: -5,
  TransactionNotFound: -6,
  FailedToUpdate: -7,
  BadRequest: -8,
  TransactionCanceled: -9,
} as const;

type ClickBody = {
  click_trans_id?: string | number;
  service_id?: string | number;
  click_paydoc_id?: string | number;
  merchant_trans_id?: string;
  merchant_prepare_id?: string | number;
  amount?: string | number;
  action?: string | number;
  error?: string | number;
  error_note?: string;
  sign_time?: string;
  sign_string?: string;
};

@Injectable()
export class ClickProvider implements PaymentProvider {
  readonly name = 'click' as const;
  private readonly logger = new Logger(ClickProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async createInvoice(
    booking: InvoiceBooking,
    paymentId: string,
  ): Promise<CreateInvoiceResult> {
    const serviceId = this.config.get<string>('CLICK_SERVICE_ID') ?? '';
    const merchantId = this.config.get<string>('CLICK_MERCHANT_ID') ?? '';
    const returnUrl =
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'http://localhost:5173';
    const amount = decimalToString(booking.depositAmount);
    const qs = new URLSearchParams({
      service_id: serviceId,
      merchant_id: merchantId,
      amount,
      transaction_param: paymentId,
      return_url: `${returnUrl}/booking/success?code=${booking.publicCode}`,
    });
    return {
      url: `https://my.click.uz/services/pay?${qs.toString()}`,
      invoiceId: paymentId,
    };
  }

  verifySignature(req: ProviderWebhookContext): boolean {
    const body = normalizeClickBody(req.body);
    const secret = this.config.get<string>('CLICK_SECRET_KEY') ?? '';
    if (!body.sign_string || !secret) {
      return false;
    }
    const action = Number(body.action);
    return verifyClickSignature(
      {
        clickTransId: body.click_trans_id ?? '',
        serviceId: body.service_id ?? '',
        secretKey: secret,
        merchantTransId: body.merchant_trans_id ?? '',
        amount: body.amount ?? '',
        action,
        signTime: body.sign_time ?? '',
        merchantPrepareId:
          action === 1 ? body.merchant_prepare_id : undefined,
      },
      body.sign_string,
    );
  }

  async handleWebhook(req: ProviderWebhookContext): Promise<ProviderWebhookResult> {
    const body = normalizeClickBody(req.body);

    if (!this.verifySignature(req)) {
      return {
        responseBody: {
          error: ClickError.SignFailed,
          error_note: 'Invalid sign_string',
        },
        event: { type: 'noop', providerTxnId: '', raw: body },
      };
    }

    const action = Number(body.action);
    if (action === 0) {
      return this.prepare(body);
    }
    if (action === 1) {
      return this.complete(body);
    }
    return {
      responseBody: {
        error: ClickError.ActionNotFound,
        error_note: 'action not found',
      },
      event: { type: 'noop', providerTxnId: '', raw: body },
    };
  }

  private async prepare(body: ClickBody): Promise<ProviderWebhookResult> {
    const paymentId = body.merchant_trans_id;
    if (!paymentId) {
      return {
        responseBody: {
          error: ClickError.BadRequest,
          error_note: 'merchant_trans_id required',
        },
        event: { type: 'noop', providerTxnId: '', raw: body },
      };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, provider: 'click' },
      include: { booking: true },
    });
    if (!payment) {
      return {
        responseBody: {
          error: ClickError.UserNotFound,
          error_note: 'Payment not found',
        },
        event: { type: 'noop', providerTxnId: '', raw: body },
      };
    }

    if (payment.status === PaymentRecordStatus.succeeded) {
      return {
        responseBody: {
          error: ClickError.AlreadyPaid,
          error_note: 'Already paid',
        },
        event: { type: 'noop', providerTxnId: String(body.click_trans_id ?? ''), raw: body },
      };
    }

    if (payment.booking.status === BookingStatus.cancelled) {
      return {
        responseBody: {
          error: ClickError.TransactionCanceled,
          error_note: 'Booking cancelled',
        },
        event: { type: 'noop', providerTxnId: String(body.click_trans_id ?? ''), raw: body },
      };
    }

    const expected = Number(decimalToString(payment.amount));
    const got = Number(body.amount);
    if (!Number.isFinite(got) || Math.abs(got - expected) > 0.001) {
      return {
        responseBody: {
          error: ClickError.InvalidAmount,
          error_note: 'Invalid amount',
        },
        event: { type: 'noop', providerTxnId: String(body.click_trans_id ?? ''), raw: body },
      };
    }

    // Numeric prepare id derived from payment UUID (stable for retries).
    const prepareId = prepareIdFromPaymentId(payment.id);

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentRecordStatus.pending,
        payload: {
          ...(asObject(payment.payload) ?? {}),
          click: {
            prepare_id: prepareId,
            click_trans_id: body.click_trans_id,
            last_action: 0,
          },
          lastWebhook: body,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      responseBody: {
        click_trans_id: body.click_trans_id,
        merchant_trans_id: payment.id,
        merchant_prepare_id: prepareId,
        error: ClickError.Success,
        error_note: 'Success',
      },
      event: {
        type: 'noop',
        providerTxnId: String(body.click_trans_id ?? ''),
        paymentId: payment.id,
        raw: body,
      },
    };
  }

  private async complete(body: ClickBody): Promise<ProviderWebhookResult> {
    const paymentId = body.merchant_trans_id;
    const clickTxnId = String(body.click_trans_id ?? '');

    if (!paymentId) {
      return {
        responseBody: {
          error: ClickError.BadRequest,
          error_note: 'merchant_trans_id required',
        },
        event: { type: 'noop', providerTxnId: clickTxnId, raw: body },
      };
    }

    // Idempotent: already recorded under this click_trans_id
    const byTxn = await this.prisma.payment.findFirst({
      where: { provider: 'click', providerTxnId: clickTxnId },
    });
    if (byTxn && byTxn.status === PaymentRecordStatus.succeeded) {
      return {
        responseBody: {
          click_trans_id: body.click_trans_id,
          merchant_trans_id: byTxn.id,
          merchant_confirm_id: body.merchant_prepare_id,
          error: ClickError.Success,
          error_note: 'Success',
        },
        event: {
          type: 'payment.succeeded',
          providerTxnId: clickTxnId,
          paymentId: byTxn.id,
          amountUzs: decimalToString(byTxn.amount),
          raw: body,
        },
      };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, provider: 'click' },
      include: { booking: true },
    });
    if (!payment) {
      return {
        responseBody: {
          error: ClickError.UserNotFound,
          error_note: 'Payment not found',
        },
        event: { type: 'noop', providerTxnId: clickTxnId, raw: body },
      };
    }

    const expectedPrepare = prepareIdFromPaymentId(payment.id);
    if (Number(body.merchant_prepare_id) !== expectedPrepare) {
      this.logger.warn(
        { expectedPrepare, got: body.merchant_prepare_id },
        'Click prepare id mismatch',
      );
      return {
        responseBody: {
          error: ClickError.TransactionNotFound,
          error_note: 'merchant_prepare_id not found',
        },
        event: { type: 'noop', providerTxnId: clickTxnId, raw: body },
      };
    }

    const clickError = Number(body.error ?? 0);
    if (clickError < 0) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.failed,
          payload: {
            ...(asObject(payment.payload) ?? {}),
            click: { last_action: 1, error: clickError },
            lastWebhook: body,
          } as Prisma.InputJsonValue,
        },
      });
      return {
        responseBody: {
          click_trans_id: body.click_trans_id,
          merchant_trans_id: payment.id,
          merchant_confirm_id: body.merchant_prepare_id,
          error: ClickError.Success,
          error_note: 'Payment failed on Click side',
        },
        event: {
          type: 'payment.failed',
          providerTxnId: clickTxnId,
          paymentId: payment.id,
          raw: body,
        },
      };
    }

    const expected = Number(decimalToString(payment.amount));
    const got = Number(body.amount);
    if (!Number.isFinite(got) || Math.abs(got - expected) > 0.001) {
      return {
        responseBody: {
          error: ClickError.InvalidAmount,
          error_note: 'Invalid amount',
        },
        event: { type: 'noop', providerTxnId: clickTxnId, raw: body },
      };
    }

    if (payment.status === PaymentRecordStatus.succeeded) {
      return {
        responseBody: {
          click_trans_id: body.click_trans_id,
          merchant_trans_id: payment.id,
          merchant_confirm_id: body.merchant_prepare_id,
          error: ClickError.Success,
          error_note: 'Success',
        },
        event: {
          type: 'payment.succeeded',
          providerTxnId: clickTxnId || payment.providerTxnId || payment.id,
          paymentId: payment.id,
          amountUzs: decimalToString(payment.amount),
          raw: body,
        },
      };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerTxnId: clickTxnId,
        payload: {
          ...(asObject(payment.payload) ?? {}),
          click: {
            prepare_id: expectedPrepare,
            click_trans_id: clickTxnId,
            last_action: 1,
          },
          lastWebhook: body,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      responseBody: {
        click_trans_id: body.click_trans_id,
        merchant_trans_id: payment.id,
        merchant_confirm_id: body.merchant_prepare_id,
        error: ClickError.Success,
        error_note: 'Success',
      },
      event: {
        type: 'payment.succeeded',
        providerTxnId: clickTxnId,
        paymentId: payment.id,
        amountUzs: decimalToString(payment.amount),
        raw: body,
      },
    };
  }
}

function normalizeClickBody(body: unknown): ClickBody {
  if (!body || typeof body !== 'object') {
    return {};
  }
  return body as ClickBody;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Stable positive int32-ish prepare id from UUID. */
export function prepareIdFromPaymentId(paymentId: string): number {
  let hash = 0;
  for (let i = 0; i < paymentId.length; i++) {
    hash = (hash * 31 + paymentId.charCodeAt(i)) >>> 0;
  }
  // Keep in positive 31-bit range, non-zero
  return (hash % 2_000_000_000) + 1;
}
