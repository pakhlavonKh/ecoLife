/**
 * Normalize Uzbek phone numbers to E.164 (+998…).
 * Accepts: +998901234567, 998901234567, 901234567, 8 90 123 45 67, etc.
 */
export function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  let national: string;
  if (digits.startsWith('998') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('8') && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  } else {
    throw new Error('Invalid phone number');
  }

  if (!/^[0-9]{9}$/.test(national)) {
    throw new Error('Invalid phone number');
  }

  return `+998${national}`;
}
