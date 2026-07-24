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
import { uzsToTiyin, verifyPaymeBasicAuth } from './payme.auth';

/** Payme Merchant API transaction states. */
export const PaymeState = {
  Pending: 1,
  Paid: 2,
  PendingCanceled: -1,
  PaidCanceled: -2,
} as const;

export const PaymeError = {
  InvalidAmount: {
    code: -31001,
    message: { ru: 'Недопустимая сумма', uz: "Noto'g'ri summa", en: 'Invalid amount' },
  },
  TransactionNotFound: {
    code: -31003,
    message: {
      ru: 'Транзакция не найдена',
      uz: 'Tranzaksiya topilmadi',
      en: 'Transaction not found',
    },
  },
  CantDoOperation: {
    code: -31008,
    message: {
      ru: 'Невозможно выполнить операцию',
      uz: "Operatsiyani bajarib bo'lmaydi",
      en: "Can't perform operation",
    },
  },
  AccountNotFound: {
    code: -31050,
    message: {
      ru: 'Платеж не найден',
      uz: "To'lov topilmadi",
      en: 'Payment not found',
    },
  },
  AlreadyPaid: {
    code: -31051,
    message: {
      ru: 'Платеж уже оплачен',
      uz: "To'lov allaqachon to'langan",
      en: 'Already paid',
    },
  },
  InvalidAuthorization: {
    code: -32504,
    message: {
      ru: 'Ошибка авторизации',
      uz: 'Avtorizatsiya xatosi',
      en: 'Authorization error',
    },
  },
  MethodNotFound: {
    code: -32601,
    message: {
      ru: 'Метод не найден',
      uz: 'Metod topilmadi',
      en: 'Method not found',
    },
  },
} as const;

type PaymeRpcBody = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
};

type PaymeTxnMeta = {
  state: number;
  create_time: number;
  perform_time: number | null;
  cancel_time: number | null;
  reason: number | null;
  payme_transaction_id: string;
  amount_tiyin: number;
};

@Injectable()
export class PaymeProvider implements PaymentProvider {
  readonly name = 'payme' as const;
  private readonly logger = new Logger(PaymeProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async createInvoice(
    booking: InvoiceBooking,
    paymentId: string,
  ): Promise<CreateInvoiceResult> {
    const merchantId = this.config.get<string>('PAYME_MERCHANT_ID') ?? '';
    const amountTiyin = uzsToTiyin(decimalToString(booking.depositAmount));
    const returnUrl =
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'http://localhost:5173';
    const params = [
      `m=${merchantId}`,
      `ac.payment_id=${paymentId}`,
      `a=${amountTiyin}`,
      `c=${returnUrl}/booking/success?code=${booking.publicCode}`,
    ].join(';');
    const encoded = Buffer.from(params, 'utf8').toString('base64');
    const checkoutHost =
      this.config.get<string>('PAYME_CHECKOUT_URL') ??
      'https://checkout.paycom.uz';
    return {
      url: `${checkoutHost.replace(/\/$/, '')}/${encoded}`,
      invoiceId: paymentId,
    };
  }

  verifySignature(req: ProviderWebhookContext): boolean {
    const auth = headerValue(req.headers, 'authorization');
    const key = this.config.get<string>('PAYME_KEY') ?? '';
    const login = this.config.get<string>('PAYME_LOGIN') ?? 'Paycom';
    return verifyPaymeBasicAuth(auth, key, login);
  }

  async handleWebhook(req: ProviderWebhookContext): Promise<ProviderWebhookResult> {
    if (!this.verifySignature(req)) {
      const id = (req.body as PaymeRpcBody)?.id ?? null;
      return {
        responseBody: { jsonrpc: '2.0', id, error: PaymeError.InvalidAuthorization },
        event: { type: 'noop', providerTxnId: '', raw: req.body },
      };
    }

    const body = req.body as PaymeRpcBody;
    const id = body.id ?? null;
    const method = body.method ?? '';
    const params = body.params ?? {};

    try {
      switch (method) {
        case 'CheckPerformTransaction':
          return {
            responseBody: await this.checkPerform(id, params),
            event: { type: 'noop', providerTxnId: '', raw: body },
          };
        case 'CreateTransaction':
          return {
            responseBody: await this.createTransaction(id, params),
            event: { type: 'noop', providerTxnId: String(params.id ?? ''), raw: body },
          };
        case 'PerformTransaction':
          return this.performTransaction(id, params, body);
        case 'CancelTransaction':
          return this.cancelTransaction(id, params, body);
        case 'CheckTransaction':
          return {
            responseBody: await this.checkTransaction(id, params),
            event: { type: 'noop', providerTxnId: String(params.id ?? ''), raw: body },
          };
        case 'GetStatement':
          return {
            responseBody: await this.getStatement(id, params),
            event: { type: 'noop', providerTxnId: '', raw: body },
          };
        default:
          return {
            responseBody: { jsonrpc: '2.0', id, error: PaymeError.MethodNotFound },
            event: { type: 'noop', providerTxnId: '', raw: body },
          };
      }
    } catch (err) {
      this.logger.error({ err, method }, 'Payme webhook handler error');
      return {
        responseBody: { jsonrpc: '2.0', id, error: PaymeError.CantDoOperation },
        event: { type: 'noop', providerTxnId: '', raw: body },
      };
    }
  }

  private async checkPerform(
    id: number | string | null,
    params: Record<string, unknown>,
  ) {
    const amount = Number(params.amount);
    const account = (params.account ?? {}) as { payment_id?: string };
    const payment = await this.findPayment(account.payment_id);
    if (!payment) {
      return { jsonrpc: '2.0', id, error: PaymeError.AccountNotFound };
    }
    if (payment.status === PaymentRecordStatus.succeeded) {
      return { jsonrpc: '2.0', id, error: PaymeError.AlreadyPaid };
    }
    if (payment.booking.status === BookingStatus.cancelled) {
      return { jsonrpc: '2.0', id, error: PaymeError.CantDoOperation };
    }
    const expected = uzsToTiyin(decimalToString(payment.amount));
    if (!Number.isFinite(amount) || amount !== expected) {
      return { jsonrpc: '2.0', id, error: PaymeError.InvalidAmount };
    }
    return {
      jsonrpc: '2.0',
      id,
      result: { allow: true },
    };
  }

  private async createTransaction(
    id: number | string | null,
    params: Record<string, unknown>,
  ) {
    const paymeTxnId = String(params.id ?? '');
    const amount = Number(params.amount);
    const time = Number(params.time ?? Date.now());
    const account = (params.account ?? {}) as { payment_id?: string };

    const existing = await this.prisma.payment.findFirst({
      where: { provider: 'payme', providerTxnId: paymeTxnId },
    });
    if (existing) {
      const meta = this.readMeta(existing.payload);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: existing.id,
          state: meta?.state ?? PaymeState.Pending,
          create_time: meta?.create_time ?? existing.createdAt.getTime(),
        },
      };
    }

    const payment = await this.findPayment(account.payment_id);
    if (!payment) {
      return { jsonrpc: '2.0', id, error: PaymeError.AccountNotFound };
    }
    if (payment.status === PaymentRecordStatus.succeeded) {
      return { jsonrpc: '2.0', id, error: PaymeError.AlreadyPaid };
    }

    const expected = uzsToTiyin(decimalToString(payment.amount));
    if (amount !== expected) {
      return { jsonrpc: '2.0', id, error: PaymeError.InvalidAmount };
    }

    // Another Payme txn already pending for this payment?
    if (
      payment.providerTxnId &&
      payment.providerTxnId !== paymeTxnId &&
      payment.status === PaymentRecordStatus.pending
    ) {
      return { jsonrpc: '2.0', id, error: PaymeError.CantDoOperation };
    }

    const meta: PaymeTxnMeta = {
      state: PaymeState.Pending,
      create_time: time,
      perform_time: null,
      cancel_time: null,
      reason: null,
      payme_transaction_id: paymeTxnId,
      amount_tiyin: amount,
    };

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerTxnId: paymeTxnId,
        status: PaymentRecordStatus.pending,
        payload: {
          ...(asObject(payment.payload) ?? {}),
          payme: meta,
          lastRpc: { method: 'CreateTransaction', params },
        } as Prisma.InputJsonValue,
      },
    });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        transaction: payment.id,
        state: PaymeState.Pending,
        create_time: time,
      },
    };
  }

  private async performTransaction(
    id: number | string | null,
    params: Record<string, unknown>,
    raw: unknown,
  ): Promise<ProviderWebhookResult> {
    const paymeTxnId = String(params.id ?? '');
    const payment = await this.prisma.payment.findFirst({
      where: { provider: 'payme', providerTxnId: paymeTxnId },
      include: { booking: true },
    });
    if (!payment) {
      return {
        responseBody: { jsonrpc: '2.0', id, error: PaymeError.TransactionNotFound },
        event: { type: 'noop', providerTxnId: paymeTxnId, raw },
      };
    }

    const meta = this.readMeta(payment.payload);
    if (meta?.state === PaymeState.Paid || payment.status === PaymentRecordStatus.succeeded) {
      // Idempotent: already performed
      return {
        responseBody: {
          jsonrpc: '2.0',
          id,
          result: {
            transaction: payment.id,
            state: PaymeState.Paid,
            perform_time: meta?.perform_time ?? payment.updatedAt.getTime(),
          },
        },
        event: {
          type: 'payment.succeeded',
          providerTxnId: paymeTxnId,
          paymentId: payment.id,
          amountUzs: decimalToString(payment.amount),
          raw,
        },
      };
    }

    if (meta && meta.state < 0) {
      return {
        responseBody: { jsonrpc: '2.0', id, error: PaymeError.CantDoOperation },
        event: { type: 'noop', providerTxnId: paymeTxnId, raw },
      };
    }

    const performTime = Date.now();
    const nextMeta: PaymeTxnMeta = {
      state: PaymeState.Paid,
      create_time: meta?.create_time ?? payment.createdAt.getTime(),
      perform_time: performTime,
      cancel_time: null,
      reason: null,
      payme_transaction_id: paymeTxnId,
      amount_tiyin: meta?.amount_tiyin ?? uzsToTiyin(decimalToString(payment.amount)),
    };

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        payload: {
          ...(asObject(payment.payload) ?? {}),
          payme: nextMeta,
          lastRpc: { method: 'PerformTransaction', params },
        } as Prisma.InputJsonValue,
      },
    });

    return {
      responseBody: {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: payment.id,
          state: PaymeState.Paid,
          perform_time: performTime,
        },
      },
      event: {
        type: 'payment.succeeded',
        providerTxnId: paymeTxnId,
        paymentId: payment.id,
        amountUzs: decimalToString(payment.amount),
        raw,
      },
    };
  }

  private async cancelTransaction(
    id: number | string | null,
    params: Record<string, unknown>,
    raw: unknown,
  ): Promise<ProviderWebhookResult> {
    const paymeTxnId = String(params.id ?? '');
    const reason = Number(params.reason ?? 0);
    const payment = await this.prisma.payment.findFirst({
      where: { provider: 'payme', providerTxnId: paymeTxnId },
    });
    if (!payment) {
      return {
        responseBody: { jsonrpc: '2.0', id, error: PaymeError.TransactionNotFound },
        event: { type: 'noop', providerTxnId: paymeTxnId, raw },
      };
    }

    const meta = this.readMeta(payment.payload);
    const cancelTime = Date.now();
    const wasPaid =
      meta?.state === PaymeState.Paid ||
      payment.status === PaymentRecordStatus.succeeded;
    const newState = wasPaid ? PaymeState.PaidCanceled : PaymeState.PendingCanceled;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: wasPaid
          ? PaymentRecordStatus.refunded
          : PaymentRecordStatus.failed,
        payload: {
          ...(asObject(payment.payload) ?? {}),
          payme: {
            ...(meta ?? {}),
            state: newState,
            cancel_time: cancelTime,
            reason,
          },
          lastRpc: { method: 'CancelTransaction', params },
        } as Prisma.InputJsonValue,
      },
    });

    return {
      responseBody: {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: payment.id,
          state: newState,
          cancel_time: cancelTime,
        },
      },
      event: {
        type: 'payment.failed',
        providerTxnId: paymeTxnId,
        paymentId: payment.id,
        raw,
      },
    };
  }

  private async checkTransaction(
    id: number | string | null,
    params: Record<string, unknown>,
  ) {
    const paymeTxnId = String(params.id ?? '');
    const payment = await this.prisma.payment.findFirst({
      where: { provider: 'payme', providerTxnId: paymeTxnId },
    });
    if (!payment) {
      return { jsonrpc: '2.0', id, error: PaymeError.TransactionNotFound };
    }
    const meta = this.readMeta(payment.payload);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        transaction: payment.id,
        state: meta?.state ?? PaymeState.Pending,
        create_time: meta?.create_time ?? payment.createdAt.getTime(),
        perform_time: meta?.perform_time ?? 0,
        cancel_time: meta?.cancel_time ?? 0,
        reason: meta?.reason ?? null,
      },
    };
  }

  private async getStatement(
    id: number | string | null,
    params: Record<string, unknown>,
  ) {
    const from = Number(params.from ?? 0);
    const to = Number(params.to ?? Date.now());
    const rows = await this.prisma.payment.findMany({
      where: {
        provider: 'payme',
        providerTxnId: { not: null },
        createdAt: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      take: 500,
    });
    return {
      jsonrpc: '2.0',
      id,
      result: {
        transactions: rows.map((p) => {
          const meta = this.readMeta(p.payload);
          return {
            id: p.providerTxnId,
            time: meta?.create_time ?? p.createdAt.getTime(),
            amount: meta?.amount_tiyin ?? uzsToTiyin(decimalToString(p.amount)),
            account: { payment_id: p.id },
            create_time: meta?.create_time ?? p.createdAt.getTime(),
            perform_time: meta?.perform_time ?? 0,
            cancel_time: meta?.cancel_time ?? 0,
            transaction: p.id,
            state: meta?.state ?? PaymeState.Pending,
            reason: meta?.reason ?? null,
          };
        }),
      },
    };
  }

  private async findPayment(paymentId?: string) {
    if (!paymentId) {
      return null;
    }
    return this.prisma.payment.findFirst({
      where: { id: paymentId, provider: 'payme' },
      include: { booking: true },
    });
  }

  private readMeta(payload: unknown): PaymeTxnMeta | null {
    const obj = asObject(payload);
    const payme = obj?.payme;
    if (!payme || typeof payme !== 'object') {
      return null;
    }
    return payme as PaymeTxnMeta;
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) {
    return undefined;
  }
  const v = headers[key];
  return Array.isArray(v) ? v[0] : v;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
