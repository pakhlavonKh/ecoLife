import {
  buildClickSignString,
  verifyClickSignature,
} from '../providers/click.sign';
import { prepareIdFromPaymentId } from '../providers/click.provider';

describe('Click SHOP-API MD5 signature', () => {
  const secret = 'click-secret-key';

  it('verifies Prepare (action=0) signature without merchant_prepare_id', () => {
    const params = {
      clickTransId: 3001234567,
      serviceId: 94048,
      secretKey: secret,
      merchantTransId: 'payment-uuid-1',
      amount: 499000,
      action: 0,
      signTime: '2026-05-05 14:30:00',
    };
    const sign = buildClickSignString(params);
    expect(verifyClickSignature(params, sign)).toBe(true);
    expect(verifyClickSignature(params, 'deadbeef')).toBe(false);
  });

  it('verifies Complete (action=1) signature with merchant_prepare_id', () => {
    const params = {
      clickTransId: 3001234567,
      serviceId: 94048,
      secretKey: secret,
      merchantTransId: 'payment-uuid-1',
      merchantPrepareId: 42,
      amount: '499000.00',
      action: 1,
      signTime: '2026-05-05 14:31:12',
    };
    const sign = buildClickSignString(params);
    expect(verifyClickSignature(params, sign)).toBe(true);

    // Prepare-style hash (without prepare id) must NOT match complete sign
    const prepareOnly = buildClickSignString({
      ...params,
      merchantPrepareId: undefined,
    });
    expect(prepareOnly).not.toBe(sign);
  });

  it('rejects empty secret or sign', () => {
    expect(
      verifyClickSignature(
        {
          clickTransId: 1,
          serviceId: 1,
          secretKey: '',
          merchantTransId: 'x',
          amount: 1,
          action: 0,
          signTime: 't',
        },
        'abc',
      ),
    ).toBe(false);
  });

  it('prepareIdFromPaymentId is stable and non-zero', () => {
    const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    expect(prepareIdFromPaymentId(id)).toBe(prepareIdFromPaymentId(id));
    expect(prepareIdFromPaymentId(id)).toBeGreaterThan(0);
  });
});
