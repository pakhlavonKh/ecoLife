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

/** YYYY-MM-DD → DD/MM/YYYY */
export function isoToDisplayDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  const parsed = dayjs(`${y}-${m}-${d}`);
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== iso) return '';
  return `${d}/${m}/${y}`;
}

/** DD/MM/YYYY (or loose digits) → YYYY-MM-DD, or '' if incomplete/invalid */
export function displayToIsoDate(display) {
  const digits = String(display || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) return '';
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const iso = `${year}-${month}-${day}`;
  const parsed = dayjs(iso);
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== iso) return '';
  return iso;
}

/** Mask typing into DD/MM/YYYY */
export function maskDateInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(
    Boolean,
  );
  return parts.join('/');
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

/** Single "name surname" field → API firstName / lastName (surname optional). */
export function splitFullName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/** DB cottage name → localized label via i18n `cottages.*` keys */
export function translateCottageName(name, t) {
  if (!name) return '';
  const key = `cottages.${name}`;
  const translated = t(key, { defaultValue: '' });
  return translated || name;
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

/** Site operator phones shown when online payment is off (same as Footer / BookingPage). */
export const OPERATOR_PHONES = [
  { display: '+998 55 900 01 10', tel: '+998559000110' },
  { display: '+998 98 150 50 80', tel: '+998981505080' },
];

export function operatorPhonesDisplay() {
  return OPERATOR_PHONES.map((p) => p.display).join(', ');
}
