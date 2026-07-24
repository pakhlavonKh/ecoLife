import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateInvoiceResult,
  InvoiceBooking,
  PaymentProvider,
  ProviderWebhookContext,
  ProviderWebhookResult,
} from '../payment-provider.interface';

@Injectable()
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  constructor(private readonly config: ConfigService) {}

  async createInvoice(
    _booking: InvoiceBooking,
    paymentId: string,
  ): Promise<CreateInvoiceResult> {
    const base = this.apiPublicUrl();
    return {
      url: `${base}/api/v1/payments/mock/${paymentId}`,
      invoiceId: paymentId,
    };
  }

  verifySignature(_req: ProviderWebhookContext): boolean {
    // Dev-only internal page — no external signature.
    return true;
  }

  async handleWebhook(req: ProviderWebhookContext): Promise<ProviderWebhookResult> {
    const body = (req.body ?? {}) as {
      paymentId?: string;
      outcome?: 'success' | 'fail';
    };
    const paymentId = body.paymentId;
    if (!paymentId) {
      return {
        responseBody: { ok: false, error: 'paymentId required' },
        httpStatus: 400,
        event: { type: 'noop', providerTxnId: '', raw: body },
      };
    }

    if (body.outcome === 'fail') {
      return {
        responseBody: { ok: true, status: 'failed' },
        event: {
          type: 'payment.failed',
          providerTxnId: paymentId,
          paymentId,
          raw: body,
        },
      };
    }

    return {
      responseBody: { ok: true, status: 'succeeded' },
      event: {
        type: 'payment.succeeded',
        providerTxnId: paymentId,
        paymentId,
        raw: body,
      },
    };
  }

  private apiPublicUrl(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') ??
      `http://localhost:${this.config.get('PORT') ?? 3000}`
    ).replace(/\/$/, '');
  }
}
