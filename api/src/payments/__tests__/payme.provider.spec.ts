import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymeProvider } from '../providers/payme.provider';
import { Decimal } from '@prisma/client/runtime/library';

describe('PaymeProvider (Subscribe API)', () => {
  let provider: PaymeProvider;
  let configService: ConfigService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    configService = new ConfigService({
      PAYME_MERCHANT_ID: 'test_merchant_123',
      PAYME_KEY: 'test_secret_key_456',
      PAYME_TEST: 'true',
    });
    provider = new PaymeProvider(configService);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('createInvoice', () => {
    it('creates a receipt via receipts.create and returns checkout URL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            receipt: {
              _id: 'rec_62da73b0803a',
              state: 0,
              amount: 50000000,
            },
          },
        }),
      } as Response);

      const booking = {
        id: 'b-1',
        publicCode: 'BK-1234',
        depositAmount: new Decimal(500000),
        expiresAt: new Date(),
        status: 'pending_payment' as const,
      };

      const result = await provider.createInvoice(booking, 'p-1');

      expect(result.invoiceId).toBe('rec_62da73b0803a');
      expect(result.url).toContain('rec_62da73b0803a');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://checkout.test.paycom.uz/api',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Auth': 'test_merchant_123:test_secret_key_456',
          }),
        }),
      );
    });
  });

  describe('createCardTokenAndSendOtp', () => {
    it('calls cards.create with save: false and cards.get_verify_code', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        callCount++;
        const body = JSON.parse(options.body);

        if (body.method === 'cards.create') {
          expect(body.params.save).toBe(false);
          expect(body.params.card.number).toBe('8600060921090842');
          return {
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              id: 1,
              result: {
                card: {
                  token: 'card_token_xyz',
                  phone: '998901234567',
                  verify: false,
                },
              },
            }),
          } as Response;
        }

        if (body.method === 'cards.get_verify_code') {
          expect(body.params.token).toBe('card_token_xyz');
          return {
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              id: 2,
              result: {
                sent: true,
                phone: '99890******67',
              },
            }),
          } as Response;
        }

        throw new Error(`Unexpected method: ${body.method}`);
      });

      const res = await provider.createCardTokenAndSendOtp(
        '500000',
        '8600 0609 2109 0842',
        '03/99',
      );

      expect(res.token).toBe('card_token_xyz');
      expect(res.phone).toBe('99890******67');
      expect(callCount).toBe(2);
    });

    it('throws BadRequestException if Payme Subscribe API returns RPC error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -31001,
            message: { ru: 'Недопустимая карта или истек срок', uz: 'Xato karta' },
          },
        }),
      } as Response);

      await expect(
        provider.createCardTokenAndSendOtp('500000', '4444445987459073', '03/99'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyAndPayReceipt', () => {
    it('calls cards.verify and receipts.pay successfully', async () => {
      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        const body = JSON.parse(options.body);

        if (body.method === 'cards.verify') {
          return {
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              id: 1,
              result: {
                card: { token: 'card_token_xyz', verify: true },
              },
            }),
          } as Response;
        }

        if (body.method === 'receipts.pay') {
          return {
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              id: 2,
              result: {
                receipt: {
                  _id: 'rec_123',
                  state: 4,
                  pay_time: Date.now(),
                },
              },
            }),
          } as Response;
        }

        throw new Error(`Unexpected method ${body.method}`);
      });

      const receipt = await provider.verifyAndPayReceipt(
        'rec_123',
        'card_token_xyz',
        '666666',
      );

      expect(receipt._id).toBe('rec_123');
      expect(receipt.state).toBe(4);
    });
  });
});
