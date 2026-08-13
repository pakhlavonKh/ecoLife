/**
 * Payme Merchant API auth: HTTP Basic `Paycom:<PAYME_KEY>` (or custom login via env).
 * @see https://developer.help.paycom.uz/
 */
export function verifyPaymeBasicAuth(
  authorizationHeader: string | undefined,
  merchantKey: string,
  login = 'Paycom',
): boolean {
  if (!authorizationHeader || !merchantKey) {
    return false;
  }
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Basic' || !token) {
    return false;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) {
    return false;
  }
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === login && pass === merchantKey;
}

export function buildPaymeBasicHeader(
  merchantKey: string,
  login = 'Paycom',
): string {
  return `Basic ${Buffer.from(`${login}:${merchantKey}`).toString('base64')}`;
}

/** Payme Subscribe API auth header: `X-Auth: {id}:{password}` */
export function buildPaymeSubscribeAuthHeader(id: string, password: string): string {
  return `${id.trim()}:${password.trim()}`;
}

/** UZS decimal → tiyin (1 UZS = 100 tiyin). */
export function uzsToTiyin(uzs: string | number): number {
  const n = typeof uzs === 'number' ? uzs : Number(uzs);
  return Math.round(n * 100);
}

