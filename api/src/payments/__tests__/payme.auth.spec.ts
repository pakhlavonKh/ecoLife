import {
  buildPaymeBasicHeader,
  uzsToTiyin,
  verifyPaymeBasicAuth,
} from '../providers/payme.auth';

describe('Payme Basic Auth / tiyin', () => {
  const key = 'test-payme-secret-key';

  it('accepts valid Basic Paycom:KEY', () => {
    const header = buildPaymeBasicHeader(key);
    expect(verifyPaymeBasicAuth(header, key)).toBe(true);
  });

  it('rejects wrong key', () => {
    const header = buildPaymeBasicHeader('other-key');
    expect(verifyPaymeBasicAuth(header, key)).toBe(false);
  });

  it('rejects missing / malformed header', () => {
    expect(verifyPaymeBasicAuth(undefined, key)).toBe(false);
    expect(verifyPaymeBasicAuth('Bearer abc', key)).toBe(false);
    expect(verifyPaymeBasicAuth('Basic not-base64!!!', key)).toBe(false);
  });

  it('rejects empty merchant key', () => {
    expect(verifyPaymeBasicAuth(buildPaymeBasicHeader(key), '')).toBe(false);
  });

  it('supports custom login via env-style login', () => {
    const header = buildPaymeBasicHeader(key, 'MerchantLogin');
    expect(verifyPaymeBasicAuth(header, key, 'MerchantLogin')).toBe(true);
    expect(verifyPaymeBasicAuth(header, key, 'Paycom')).toBe(false);
  });

  it('converts UZS to tiyin', () => {
    expect(uzsToTiyin('1000.00')).toBe(100000);
    expect(uzsToTiyin(1500.5)).toBe(150050);
    expect(uzsToTiyin('0.01')).toBe(1);
  });
});
