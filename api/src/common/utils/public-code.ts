import { randomBytes } from 'crypto';

/** Short human-readable booking code, e.g. BK-3F7A */
export function generatePublicCode(): string {
  const hex = randomBytes(2).toString('hex').toUpperCase();
  return `BK-${hex}`;
}
