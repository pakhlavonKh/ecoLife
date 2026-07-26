import { envFlag, isPaymentsEnabled } from '../env-flag';

describe('envFlag', () => {
  it('defaults when unset', () => {
    expect(envFlag(undefined, false)).toBe(false);
    expect(envFlag('', true)).toBe(true);
    expect(envFlag('  ', false)).toBe(false);
  });

  it('parses common truthy/falsy strings', () => {
    expect(envFlag('true')).toBe(true);
    expect(envFlag('1')).toBe(true);
    expect(envFlag('YES')).toBe(true);
    expect(envFlag('false')).toBe(false);
    expect(envFlag('0')).toBe(false);
    expect(envFlag('off')).toBe(false);
  });
});

describe('isPaymentsEnabled', () => {
  it('defaults to false', () => {
    expect(isPaymentsEnabled({ get: () => undefined })).toBe(false);
  });

  it('reads PAYMENTS_ENABLED', () => {
    expect(
      isPaymentsEnabled({
        get: (k) => (k === 'PAYMENTS_ENABLED' ? 'true' : undefined),
      }),
    ).toBe(true);
    expect(
      isPaymentsEnabled({
        get: (k) => (k === 'PAYMENTS_ENABLED' ? 'false' : undefined),
      }),
    ).toBe(false);
  });
});
