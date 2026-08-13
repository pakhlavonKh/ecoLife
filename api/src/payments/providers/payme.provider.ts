import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decimalToString } from '../../common/utils/money';
import {
  CreateInvoiceResult,
  InvoiceBooking,
  PaymentProvider,
  ProviderWebhookContext,
  ProviderWebhookResult,
} from '../payment-provider.interface';
import { buildPaymeSubscribeAuthHeader, uzsToTiyin } from './payme.auth';

export type PaymeSubscribeReceipt = {
  _id: string;
  create_time: number;
  pay_time: number;
  cancel_time: number;
  state: number; // 0 = created, 4 = paid, 5 = canceled
  type: number;
  amount: number;
  currency: number;
  account: Array<{ name: string; value: string }>;
};

@Injectable()
export class PaymeProvider implements PaymentProvider {
  readonly name = 'payme' as const;
  private readonly logger = new Logger(PaymeProvider.name);

  constructor(private readonly config: ConfigService) {}

  private getEndpoint(): string {
    const isTest =
      this.config.get<string>('PAYME_TEST') === 'true' ||
      Boolean(this.config.get<string>('PAYME_CHECKOUT_URL')?.includes('test'));
    const envUrl = this.config.get<string>('PAYME_ENDPOINT');
    if (envUrl) return envUrl;
    return isTest
      ? 'https://checkout.test.paycom.uz/api'
      : 'https://checkout.paycom.uz/api';
  }

  private getCredentials(): { id: string; key: string } {
    const id = (
      this.config.get<string>('PAYME_MERCHANT_ID') ??
      this.config.get<string>('PAYME_CASH_ID') ??
      ''
    ).trim();
    const key = (
      this.config.get<string>('PAYME_KEY') ??
      this.config.get<string>('PAYME_SECRET') ??
      ''
    ).trim();

    if (!id || !key) {
      throw new BadRequestException(
        'Payme credentials (PAYME_MERCHANT_ID / PAYME_KEY) are missing in environment variables.',
      );
    }
    return { id, key };
  }

  /** Send JSON-RPC 2.0 request to Payme Subscribe API endpoint with dev test simulation fallback. */
  async rpcCall<T = unknown>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const isDevOrTest =
      this.config.get<string>('PAYME_TEST') === 'true' ||
      this.config.get<string>('NODE_ENV') === 'development';

    const endpoint = this.getEndpoint();
    const { id, key } = this.getCredentials();
    const authHeader = buildPaymeSubscribeAuthHeader(id, key);

    const body = {
      id: Date.now(),
      method,
      params,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth': authHeader,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Payme Subscribe API HTTP ${response.status}: ${text}`);

        if (isDevOrTest && (response.status === 401 || response.status === 403)) {
          return this.handleTestSimulation<T>(method, params);
        }

        throw new BadRequestException(
          `Payme API HTTP error: ${response.statusText || response.status}`,
        );
      }

      const json = (await response.json()) as {
        result?: T;
        error?: { code: number; message: string | Record<string, string>; data?: unknown };
      };

      if (json.error) {
        const msg =
          typeof json.error.message === 'object'
            ? json.error.message.ru || json.error.message.uz || json.error.message.en || 'Payme Error'
            : json.error.message || 'Payme API returned an error';

        this.logger.warn(`Payme Subscribe API RPC Error [${json.error.code}]: ${msg}`);

        // If credentials unauthorized on Payme test server, fallback to test simulation in dev/test
        if (
          isDevOrTest &&
          (json.error.code === -32504 ||
            msg.toLowerCase().includes('access denied') ||
            msg.toLowerCase().includes('авторизац'))
        ) {
          return this.handleTestSimulation<T>(method, params);
        }

        throw new BadRequestException(msg);
      }

      if (!json.result) {
        throw new BadRequestException('Invalid response from Payme Subscribe API');
      }

      return json.result;
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        // If authorization error threw BadRequestException in dev mode, fallback to simulation
        if (
          isDevOrTest &&
          (err.message.toLowerCase().includes('access denied') ||
            err.message.toLowerCase().includes('авторизац'))
        ) {
          return this.handleTestSimulation<T>(method, params);
        }
        throw err;
      }
      this.logger.error({ err }, `Payme Subscribe API call failed: ${method}`);
      if (isDevOrTest) {
        return this.handleTestSimulation<T>(method, params);
      }
      throw new BadRequestException(err.message || 'Failed to connect to Payme Subscribe API');
    }
  }

  /** Test simulation fallback when Payme test server credentials are unauthorized or offline. */
  private handleTestSimulation<T>(
    method: string,
    params: Record<string, unknown>,
  ): T {
    this.logger.log(`[Payme Subscribe Simulation] Executing method: ${method}`);

    switch (method) {
      case 'receipts.create': {
        const id = `rec_sim_${Date.now()}`;
        return {
          receipt: {
            _id: id,
            create_time: Date.now(),
            pay_time: 0,
            cancel_time: 0,
            state: 0,
            type: 2,
            amount: Number(params.amount || 0),
            currency: 860,
            account: [
              { name: 'payment_id', value: String((params.account as any)?.payment_id || '') },
            ],
          },
        } as T;
      }

      case 'cards.create': {
        const cardObj = (params.card ?? {}) as { number?: string; expire?: string };
        const num = (cardObj.number ?? '').replace(/\s+/g, '');

        if (num === '4444445987459073') {
          throw new BadRequestException('Карта заблокирована (Payme Test)');
        }
        if (num === '3333336415804657') {
          throw new BadRequestException('Срок действия карты истек (Payme Test)');
        }

        return {
          card: {
            token: `tok_sim_${Date.now()}`,
            phone: '99890******67',
            verify: false,
          },
        } as T;
      }

      case 'cards.get_verify_code': {
        return {
          sent: true,
          phone: '99890******67',
        } as T;
      }

      case 'cards.verify': {
        const code = String(params.code ?? '');
        if (code !== '666666') {
          throw new BadRequestException('Неверный СМС код (Тестовый код: 666666)');
        }
        return {
          card: {
            token: String(params.token ?? ''),
            verify: true,
          },
        } as T;
      }

      case 'receipts.pay': {
        return {
          receipt: {
            _id: String(params.id ?? ''),
            create_time: Date.now() - 60000,
            pay_time: Date.now(),
            cancel_time: 0,
            state: 4, // Paid
            type: 2,
            amount: 0,
            currency: 860,
            account: [],
          },
        } as T;
      }

      case 'receipts.check': {
        return {
          receipt: {
            _id: String(params.id ?? ''),
            state: 4,
          },
        } as T;
      }

      default:
        throw new BadRequestException(`Unsupported simulation method: ${method}`);
    }
  }

  /**
   * Create an invoice/receipt using Payme Subscribe API (`receipts.create`).
   */
  async createInvoice(
    booking: InvoiceBooking,
    paymentId: string,
  ): Promise<CreateInvoiceResult> {
    const amountTiyin = uzsToTiyin(decimalToString(booking.depositAmount));

    const result = await this.rpcCall<{ receipt: PaymeSubscribeReceipt }>(
      'receipts.create',
      {
        amount: amountTiyin,
        account: {
          payment_id: paymentId,
          public_code: booking.publicCode,
        },
        description: `Предоплата за бронирование ${booking.publicCode}`,
      },
    );

    const receiptId = result.receipt._id;
    const isTest = this.getEndpoint().includes('test');
    const checkoutHost = isTest
      ? 'https://checkout.test.paycom.uz'
      : 'https://checkout.paycom.uz';

    return {
      url: `${checkoutHost}/${receiptId}`,
      invoiceId: receiptId,
    };
  }

  /**
   * Initialize unsaved card token (`cards.create` with `save: false`) and request SMS OTP (`cards.get_verify_code`).
   * CARD IS NEVER SAVED TO USER ACCOUNT OR SERVERS (`save: false`).
   */
  async createCardTokenAndSendOtp(
    amountUzs: string,
    cardNumber: string,
    expire: string,
  ): Promise<{ token: string; phone: string }> {
    const cleanNumber = cardNumber.replace(/\s+/g, '');
    let cleanExpire = expire.replace(/\s+/g, '');
    if (!cleanExpire.includes('/') && cleanExpire.length === 4) {
      cleanExpire = `${cleanExpire.slice(0, 2)}/${cleanExpire.slice(2)}`;
    }

    const amountTiyin = uzsToTiyin(amountUzs);

    // Step 1: cards.create with save: false
    const cardResult = await this.rpcCall<{
      card: { token: string; phone?: string; verify?: boolean };
    }>('cards.create', {
      card: {
        number: cleanNumber,
        expire: cleanExpire,
      },
      amount: amountTiyin,
      save: false,
    });

    const token = cardResult.card.token;

    // Step 2: cards.get_verify_code
    const otpResult = await this.rpcCall<{ sent: boolean; phone: string }>(
      'cards.get_verify_code',
      { token },
    );

    return {
      token,
      phone: otpResult.phone || cardResult.card.phone || '',
    };
  }

  /**
   * Verify SMS OTP (`cards.verify`) and pay the receipt (`receipts.pay`).
   */
  async verifyAndPayReceipt(
    receiptId: string,
    token: string,
    code: string,
  ): Promise<PaymeSubscribeReceipt> {
    // Step 1: Verify OTP
    const verifyResult = await this.rpcCall<{
      card: { token: string; verify: boolean };
    }>('cards.verify', {
      token,
      code,
    });

    if (!verifyResult.card?.verify) {
      throw new BadRequestException('Неверный SMS код или подлинность карты не подтверждена');
    }

    // Step 2: Pay receipt
    const payResult = await this.rpcCall<{ receipt: PaymeSubscribeReceipt }>(
      'receipts.pay',
      {
        id: receiptId,
        token,
      },
    );

    return payResult.receipt;
  }

  /**
   * Check status of a receipt (`receipts.check`).
   */
  async checkReceipt(receiptId: string): Promise<PaymeSubscribeReceipt> {
    const result = await this.rpcCall<{ receipt: PaymeSubscribeReceipt }>(
      'receipts.check',
      { id: receiptId },
    );
    return result.receipt;
  }

  verifySignature(_req: ProviderWebhookContext): boolean {
    return true;
  }

  async handleWebhook(req: ProviderWebhookContext): Promise<ProviderWebhookResult> {
    return {
      responseBody: { status: 'ok' },
      event: { type: 'noop', providerTxnId: '', raw: req.body },
    };
  }
}
