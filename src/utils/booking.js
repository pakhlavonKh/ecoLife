import dayjs from 'dayjs';

const CATEGORY_ORDER = { standart: 0, lux: 1 };

/** Public booking preview shows only these two categories. */
export const PUBLIC_CATEGORY_CODES = ['standart', 'lux'];

export const DEFAULT_DEPOSIT = { standart: 30, lux: 50 };

export function sortCategories(categories) {
  return [...categories].sort(
    (a, b) =>
      (CATEGORY_ORDER[a.code] ?? 99) - (CATEGORY_ORDER[b.code] ?? 99),
  );
}

/** Confirmed age-based prices (UZS / person / night) when API is down. */
export const DEFAULT_AGE_PRICES = {
  standart: { priceAdult: 600000, priceChild: 300000, priceInfant: 0 },
  lux: { priceAdult: 800000, priceChild: 400000, priceInfant: 0 },
};

/** @deprecated use DEFAULT_AGE_PRICES */
export const DEFAULT_PRICE_PER_BED = {
  standart: DEFAULT_AGE_PRICES.standart.priceAdult,
  lux: DEFAULT_AGE_PRICES.lux.priceAdult,
};

/**
 * Normalize API category (camelCase or snake_case) and keep only standart/lux.
 */
export function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const code = String(
    raw.code ?? raw.categoryCode ?? raw.category_code ?? '',
  )
    .toLowerCase()
    .trim();
  if (!PUBLIC_CATEGORY_CODES.includes(code)) return null;

  const depositRaw =
    raw.depositPercent ?? raw.deposit_percent ?? DEFAULT_DEPOSIT[code];
  const depositPercent = Number(depositRaw);
  const defaults = DEFAULT_AGE_PRICES[code];
  const priceAdult =
    raw.priceAdult ??
    raw.price_adult ??
    raw.pricePerBedPerNight ??
    raw.price_per_bed_per_night ??
    raw.priceFrom ??
    raw.price_from ??
    defaults.priceAdult;
  const priceChild =
    raw.priceChild ?? raw.price_child ?? defaults.priceChild;
  const priceInfant =
    raw.priceInfant ?? raw.price_infant ?? defaults.priceInfant;
  const priceFrom = priceAdult ?? raw.priceFrom ?? raw.price_from ?? null;
  const priceTo = raw.priceTo ?? raw.price_to ?? priceFrom;

  return {
    id: String(raw.id || code),
    code,
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    depositPercent: Number.isFinite(depositPercent)
      ? depositPercent
      : DEFAULT_DEPOSIT[code],
    images: Array.isArray(raw.images) ? raw.images.filter(Boolean) : [],
    priceAdult: priceAdult != null ? String(priceAdult) : null,
    priceChild: priceChild != null ? String(priceChild) : null,
    priceInfant: priceInfant != null ? String(priceInfant) : null,
    pricePerBedPerNight: priceAdult != null ? String(priceAdult) : null,
    priceFrom: priceFrom != null ? String(priceFrom) : null,
    priceTo: priceTo != null ? String(priceTo) : null,
  };
}

/** Accept array or wrapped `{ categories }` / HTML garbage → public categories only. */
export function normalizeCategories(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.categories)
      ? data.categories
      : [];
  const byCode = new Map();
  for (const row of list) {
    const cat = normalizeCategory(row);
    if (cat && !byCode.has(cat.code)) byCode.set(cat.code, cat);
  }
  return sortCategories([...byCode.values()]);
}

/** Offline / API-down fallback so the page still shows Стандарт / Люкс. */
export function fallbackCategories() {
  return PUBLIC_CATEGORY_CODES.map((code) => {
    const prices = DEFAULT_AGE_PRICES[code];
    const price = String(prices.priceAdult);
    return {
      id: code,
      code,
      name: '',
      description: '',
      depositPercent: DEFAULT_DEPOSIT[code],
      images: [],
      priceAdult: price,
      priceChild: String(prices.priceChild),
      priceInfant: String(prices.priceInfant),
      pricePerBedPerNight: price,
      priceFrom: price,
      priceTo: price,
    };
  });
}

/** Default local check-in / check-out times (HOURLY.md). */
export const DEFAULT_CHECK_IN_TIME = '14:00';
export const DEFAULT_CHECK_OUT_TIME = '12:00';

export function todayStr() {
  return dayjs().format('YYYY-MM-DD');
}

export function defaultCheckIn() {
  return dayjs().add(1, 'day').format('YYYY-MM-DD');
}

export function defaultCheckOut() {
  return dayjs().add(2, 'day').format('YYYY-MM-DD');
}

/** Calendar nights between local dates (times ignored). */
export function nightsBetween(checkIn, checkOut) {
  const a = dayjs(checkIn);
  const b = dayjs(checkOut);
  if (!a.isValid() || !b.isValid()) return 0;
  return Math.max(0, b.diff(a, 'day'));
}

/**
 * Billed nights: calendar nights, minimum 1 for same-day day-use
 * (mirrors api nightsBetween / HOURLY.md §5).
 */
export function billedNights(checkIn, checkOut) {
  const nights = nightsBetween(checkIn, checkOut);
  return nights === 0 ? 1 : nights;
}

/** True when date+time form a valid half-open stay. */
export function isValidStay(checkIn, checkOut, checkInTime, checkOutTime) {
  if (!checkIn || !checkOut) return false;
  if (checkOut > checkIn) return true;
  if (checkOut < checkIn) return false;
  const tin = checkInTime || DEFAULT_CHECK_IN_TIME;
  const tout = checkOutTime || DEFAULT_CHECK_OUT_TIME;
  return tin < tout;
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

/**
 * Age-based preview:
 * total = (adults×priceAdult + children×priceChild + infants×priceInfant) × nights
 */
export function calcPreview(prices, counts, nights, depositPercent) {
  const priceAdult = Number(
    typeof prices === 'object' && prices != null
      ? prices.priceAdult
      : prices,
  );
  const priceChild = Number(
    typeof prices === 'object' && prices != null ? prices.priceChild : 0,
  );
  const priceInfant = Number(
    typeof prices === 'object' && prices != null ? prices.priceInfant : 0,
  );
  const adults = Math.max(1, Number(counts?.adults) || 1);
  const children = Math.max(0, Number(counts?.children) || 0);
  const infants = Math.max(0, Number(counts?.infants) || 0);
  const nightCount = Math.max(0, Number(nights) || 0);
  const nightly = Math.round(
    priceAdult * adults + priceChild * children + priceInfant * infants,
  );
  const total = Math.round(nightly * nightCount);
  const deposit = Math.round((total * Number(depositPercent)) / 100);
  const remaining = total - deposit;
  return {
    total,
    deposit,
    remaining,
    nights: nightCount,
    adults,
    children,
    infants,
    guests: adults + children + infants,
    occupyingBeds: adults + children,
    nightly,
    priceAdult,
    priceChild,
    priceInfant,
    pricePerBedPerNight: priceAdult,
  };
}

/** Occupying beds for availability (infants excluded). */
export function occupyingBeds(adults, children) {
  return Math.max(0, Number(adults) || 0) + Math.max(0, Number(children) || 0);
}

/** Normalize availability room row (remaining beds for shared-room UI). */
export function normalizeAvailableRoom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id != null ? String(raw.id) : '';
  if (!id) return null;
  const capacity = Number(raw.capacity ?? 0);
  const remainingBeds = Number(
    raw.remainingBeds ?? raw.remaining_beds ?? capacity,
  );
  const price =
    raw.priceAdult ??
    raw.price_adult ??
    raw.pricePerNight ??
    raw.price_per_night ??
    raw.pricePerBedPerNight ??
    raw.price_per_bed_per_night ??
    null;
  const priceChild = raw.priceChild ?? raw.price_child ?? null;
  const priceInfant = raw.priceInfant ?? raw.price_infant ?? null;
  const fromRaw = raw.availableFrom ?? raw.available_from ?? null;
  let availableFrom = null;
  if (fromRaw && typeof fromRaw === 'object') {
    const date = fromRaw.date != null ? String(fromRaw.date) : '';
    const time = fromRaw.time != null ? String(fromRaw.time) : '';
    if (date && time) {
      availableFrom = { date, time, at: fromRaw.at ? String(fromRaw.at) : '' };
    }
  }
  return {
    id,
    number: String(raw.number ?? ''),
    capacity: Number.isFinite(capacity) ? capacity : 0,
    remainingBeds: Number.isFinite(remainingBeds) ? remainingBeds : 0,
    cottageName: String(raw.cottageName ?? raw.cottage_name ?? ''),
    categoryCode: String(
      raw.categoryCode ?? raw.category_code ?? '',
    ).toLowerCase(),
    pricePerNight: price != null ? String(price) : null,
    priceAdult: price != null ? String(price) : null,
    priceChild: priceChild != null ? String(priceChild) : null,
    priceInfant: priceInfant != null ? String(priceInfant) : null,
    availableFrom,
  };
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
