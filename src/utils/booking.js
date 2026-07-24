import dayjs from 'dayjs';

const CATEGORY_ORDER = { standart: 0, lux: 1 };

export function sortCategories(categories) {
  return [...categories].sort(
    (a, b) =>
      (CATEGORY_ORDER[a.code] ?? 99) - (CATEGORY_ORDER[b.code] ?? 99),
  );
}

export function todayStr() {
  return dayjs().format('YYYY-MM-DD');
}

export function defaultCheckIn() {
  return dayjs().add(1, 'day').format('YYYY-MM-DD');
}

export function defaultCheckOut() {
  return dayjs().add(2, 'day').format('YYYY-MM-DD');
}

export function nightsBetween(checkIn, checkOut) {
  const a = dayjs(checkIn);
  const b = dayjs(checkOut);
  if (!a.isValid() || !b.isValid()) return 0;
  return Math.max(0, b.diff(a, 'day'));
}

export function formatMoney(amount, locale = 'ru-RU') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString(locale, {
    maximumFractionDigits: 0,
  })} UZS`;
}

export function calcPreview(pricePerNight, nights, depositPercent) {
  const price = Number(pricePerNight);
  const total = Math.round(price * nights);
  const deposit = Math.round((total * Number(depositPercent)) / 100);
  const remaining = total - deposit;
  return { total, deposit, remaining, nights, pricePerNight: price };
}

/** Digits-only national part (9) from any input; display as +998 XX XXX XX XX */
export function formatPhoneMask(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('998')) {
    digits = digits.slice(3);
  }
  digits = digits.slice(0, 9);

  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 7),
    digits.slice(7, 9),
  ].filter(Boolean);

  if (parts.length === 0) return '+998 ';
  return `+998 ${parts.join(' ')}`;
}

/** E.164 for API: +998XXXXXXXXX */
export function phoneToE164(masked) {
  const digits = String(masked || '').replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 9) {
    return `+998${digits}`;
  }
  return `+${digits}`;
}

export function isValidUzPhone(masked) {
  const digits = String(masked || '').replace(/\D/g, '');
  const national =
    digits.startsWith('998') && digits.length === 12
      ? digits.slice(3)
      : digits.length === 9
        ? digits
        : '';
  return /^[0-9]{9}$/.test(national);
}

export function paymentProviders() {
  const fromEnv = import.meta.env.VITE_PAYMENT_PROVIDERS;
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s === 'mock' || s === 'payme' || s === 'click');
  }
  if (import.meta.env.DEV) {
    return ['mock', 'payme', 'click'];
  }
  return ['payme', 'click'];
}
