import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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

/** Payme Merchant API JSON-RPC 2.0 error codes and standard messages. */
export const PaymeError = {
  InvalidAmount: {
    code: -31001,
    message: { ru: 'Недопустимая сумма', uz: "Noto'g'ri summa", en: 'Invalid amount' },
    data: 'amount',
  },
  TransactionNotFound: {
    code: -31003,
    message: {
      ru: 'Транзакция не найдена',
      uz: 'Tranzaksiya topilmadi',
      en: 'Transaction not found',
    },
    data: 'transaction',
  },
  CantDoOperation: {
    code: -31008,
    message: {
      ru: 'Невозможно выполнить операцию',
      uz: "Operatsiyani bajarib bo'lmaydi",
      en: "Can't perform operation",
    },
    data: 'order',
  },
  CantCancel: {
    code: -31007,
    message: {
      ru: 'Невозможно отменить транзакцию',
      uz: "Tranzaksiyani bekor qilib bo'lmaydi",
      en: "Can't cancel transaction",
    },
  },
  AccountNotFound: {
    code: -31050,
    message: {
      ru: 'Платеж не найден',
      uz: "To'lov topilmadi",
      en: 'Payment not found',
    },
    data: 'account',
  },
  AlreadyPaid: {
    code: -31051,
    message: {
      ru: 'Платеж уже оплачен',
      uz: "To'lov allaqachon to'langan",
      en: 'Already paid',
    },
    data: 'account',
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

/** Payme 12-hour hold timeout in milliseconds (43,200,000 ms). */
const PAYME_HOLD_TIMEOUT_MS = 43_200_000;

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

  /**
   * Generates a Payme Checkout URL with base64 encoded parameters.
   * `m=MERCHANT_ID;ac.payment_id=PAYMENT_ID;a=AMOUNT_IN_TIYIN;c=RETURN_URL`
   */
  async createInvoice(
    booking: InvoiceBooking,
    paymentId: string,
  ): Promise<CreateInvoiceResult> {
    const merchantId = (
      this.config.get<string>('PAYME_MERCHANT_ID') ??
      process.env.PAYME_MERCHANT_ID ??
      ''
    ).trim();
    if (!merchantId) {
      throw new BadRequestException(
        'PAYME_MERCHANT_ID is empty in api/.env. Please enter your Merchant ID from business.paycom.uz before initiating a Payme transaction.',
      );
    }
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

  /** Validates HTTP Basic `Paycom:<PAYME_KEY>` header from Payme webhook request. */
  verifySignature(req: ProviderWebhookContext): boolean {
    const auth = headerValue(req.headers, 'authorization');
    const key = this.config.get<string>('PAYME_KEY') ?? '';
    const login = this.config.get<string>('PAYME_LOGIN') ?? 'Paycom';
    return verifyPaymeBasicAuth(auth, key, login);
  }

  /** Dispatcher for Payme Merchant API JSON-RPC 2.0 requests. */
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
        case 'ChangePassword':
          return {
            responseBody: await this.changePassword(id, params),
            event: { type: 'noop', providerTxnId: '', raw: body },
          };
        case 'SetFiscalData':
          return {
            responseBody: await this.setFiscalData(id, params),
            event: { type: 'noop', providerTxnId: String(params.id ?? ''), raw: body },
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

  /** `CheckPerformTransaction`: Checks whether the payment can be created/performed. */
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

  /** `CreateTransaction`: Creates or returns an existing transaction. */
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
      const state = meta?.state ?? PaymeState.Pending;
      const createTime = meta?.create_time ?? existing.createdAt.getTime();

      // Check transaction hold timeout (12 hours)
      if (state === PaymeState.Pending && Date.now() - createTime > PAYME_HOLD_TIMEOUT_MS) {
        const cancelTime = Date.now();
        const timedOutMeta: PaymeTxnMeta = {
          state: PaymeState.PendingCanceled,
          create_time: createTime,
          perform_time: null,
          cancel_time: cancelTime,
          reason: 4,
          payme_transaction_id: paymeTxnId,
          amount_tiyin: meta?.amount_tiyin ?? 0,
        };
        await this.prisma.payment.update({
          where: { id: existing.id },
          data: {
            status: PaymentRecordStatus.failed,
            payload: {
              ...(asObject(existing.payload) ?? {}),
              payme: timedOutMeta,
            } as Prisma.InputJsonValue,
          },
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            transaction: existing.id,
            state: PaymeState.PendingCanceled,
            create_time: createTime,
            perform_time: 0,
            cancel_time: cancelTime,
            reason: 4,
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: existing.id,
          state,
          create_time: createTime,
          perform_time: meta?.perform_time ?? 0,
          cancel_time: meta?.cancel_time ?? 0,
          reason: meta?.reason ?? null,
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
    if (payment.booking.status === BookingStatus.cancelled) {
      return { jsonrpc: '2.0', id, error: PaymeError.CantDoOperation };
    }

    const expected = uzsToTiyin(decimalToString(payment.amount));
    if (amount !== expected) {
      return { jsonrpc: '2.0', id, error: PaymeError.InvalidAmount };
    }

    // Reject if another Payme txn is already pending for this payment
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

  /** `PerformTransaction`: Marks the transaction as paid and updates booking deposit status. */
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

    // Idempotent: already performed
    if (meta?.state === PaymeState.Paid || payment.status === PaymentRecordStatus.succeeded) {
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

    // Check timeout (12 hours)
    if (meta?.state === PaymeState.Pending && Date.now() - meta.create_time > PAYME_HOLD_TIMEOUT_MS) {
      const cancelTime = Date.now();
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.failed,
          payload: {
            ...(asObject(payment.payload) ?? {}),
            payme: {
              ...meta,
              state: PaymeState.PendingCanceled,
              cancel_time: cancelTime,
              reason: 4,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return {
        responseBody: { jsonrpc: '2.0', id, error: PaymeError.CantDoOperation },
        event: { type: 'noop', providerTxnId: paymeTxnId, raw },
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

  /** `CancelTransaction`: Cancels an unperformed or performs refund for a paid transaction. */
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

    // Idempotent: already cancelled
    if (meta && meta.state < 0) {
      return {
        responseBody: {
          jsonrpc: '2.0',
          id,
          result: {
            transaction: payment.id,
            cancel_time: meta.cancel_time ?? payment.updatedAt.getTime(),
            state: meta.state,
          },
        },
        event: { type: 'noop', providerTxnId: paymeTxnId, raw },
      };
    }

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

  /** `CheckTransaction`: Returns current status of transaction. */
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

  /** `GetStatement`: Returns array of transactions within the specified date range. */
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

  /** `ChangePassword`: Optional Payme administrative method for updating secret key. */
  private async changePassword(
    id: number | string | null,
    params: Record<string, unknown>,
  ) {
    const newPassword = String(params.password ?? '');
    if (!newPassword) {
      return { jsonrpc: '2.0', id, error: PaymeError.CantDoOperation };
    }
    this.logger.log('Payme requested password change');
    return {
      jsonrpc: '2.0',
      id,
      result: { success: true },
    };
  }

  /** `SetFiscalData`: Saves fiscal receipt / OFD details sent by Payme. */
  private async setFiscalData(
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

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        payload: {
          ...(asObject(payment.payload) ?? {}),
          fiscalData: params.fiscal_data ?? params,
          lastRpc: { method: 'SetFiscalData', params },
        } as Prisma.InputJsonValue,
      },
    });

    return {
      jsonrpc: '2.0',
      id,
      result: { success: true },
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
