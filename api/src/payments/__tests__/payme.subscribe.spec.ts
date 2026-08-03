import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from '../payments.service';
import { PaymeProvider } from '../providers/payme.provider';
import { ClickProvider } from '../providers/click.provider';
import { MockProvider } from '../providers/mock.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException } from '@nestjs/common';

describe('Payme Subscribe API', () => {
  let service: PaymentsService;
  let provider: PaymeProvider;
  let config: ConfigService;
  let prisma: PrismaService;

  const mockPrisma = {
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'PAYME_MERCHANT_ID') return 'mock-merchant-id';
      if (key === 'PAYME_KEY') return 'mock-payme-key';
      if (key === 'PAYME_CHECKOUT_URL') return 'https://checkout.test.paycom.uz';
      return null;
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        PaymeProvider,
        { provide: ClickProvider, useValue: {} },
        { provide: MockProvider, useValue: {} },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    provider = module.get<PaymeProvider>(PaymeProvider);
    config = module.get<ConfigService>(ConfigService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('paymeCreateCard', () => {
    it('should register a card and return verification status and token', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              jsonrpc: '2.0',
              id: 1,
              result: {
                card: {
                  token: 'mock-card-token',
                  verify: false,
                },
              },
            }),
        } as any),
      );

      const result = await service.paymeCreateCard({
        number: '8600123412341234',
        expire: '1228',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        token: 'mock-card-token',
        verify: false,
        phone: null,
      });
    });

    it('should request SMS OTP when verify is true', async () => {
      let rpcCallCount = 0;
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
        rpcCallCount++;
        if (rpcCallCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                jsonrpc: '2.0',
                id: 1,
                result: {
                  card: {
                    token: 'mock-card-token',
                    verify: true,
                  },
                },
              }),
          } as any);
        } else {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                jsonrpc: '2.0',
                id: 2,
                result: {
                  sent: true,
                  phone: '99890******12',
                },
              }),
          } as any);
        }
      });

      const result = await service.paymeCreateCard({
        number: '8600123412341234',
        expire: '1228',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        token: 'mock-card-token',
        verify: true,
        phone: '99890******12',
      });
    });

    it('should throw BadRequestException if Payme returns an error', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              jsonrpc: '2.0',
              id: 1,
              error: {
                code: -32601,
                message: 'Method not found',
              },
            }),
        } as any),
      );

      await expect(
        service.paymeCreateCard({
          number: '8600123412341234',
          expire: '1228',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
