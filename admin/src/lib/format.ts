import dayjs from 'dayjs';
import i18n from '../i18n';

/** Resort defaults — match API CHECK_IN_TIME / CHECK_OUT_TIME. */
export const DEFAULT_CHECK_IN_TIME = '14:00';
export const DEFAULT_CHECK_OUT_TIME = '12:00';

export function formatMoney(value: string | number | null | undefined): string {
  if (value == null || value === '') return i18n.t('common.emDash');
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  const amount = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return i18n.t('common.money', { amount });
}

/** Format input fields with space grouping without currency suffix (e.g. "1200000.00" -> "1 200 000"). */
export function formatMoneyInput(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const digits = String(value).replace(/\s+/g, '').split('.')[0].replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Convert formatted money input back to plain digits for API payload (e.g. "1 200 000" -> "1200000"). */
export function unformatMoneyInput(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value).replace(/\s+/g, '').split('.')[0].replace(/\D/g, '');
  return str;
}

/** Display dates as DD/MM/YYYY everywhere in the admin UI. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return i18n.t('common.emDash');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const iso = value.slice(0, 10);
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return dayjs(value).format('DD/MM/YYYY');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return i18n.t('common.emDash');
  return dayjs(value).format('DD/MM/YYYY HH:mm');
}

export function todayIso(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function addDaysIso(days: number, from = todayIso()): string {
  return dayjs(from).add(days, 'day').format('YYYY-MM-DD');
}

/**
 * Calendar nights between local dates (HOURLY.md §5).
 * Same-day day-use (dates equal, stay still valid) = 1 night.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const inDate = checkIn.slice(0, 10);
  const outDate = checkOut.slice(0, 10);
  const n = dayjs(outDate).diff(dayjs(inDate), 'day');
  if (n > 0) return n;
  if (n === 0) return 1;
  return 0;
}

/** Add minutes to HH:mm; returns { dateOffset, time } where dateOffset is days spilled. */
export function addMinutesToTime(
  hhmm: string,
  minutes: number,
): { dateOffset: number; time: string } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return { dateOffset: 0, time: hhmm };
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const dateOffset = Math.floor(total / (24 * 60));
  const rem = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  return {
    dateOffset,
    time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  };
}

/** Beds blocked until this local time after check-out (+ cleaning buffer). */
export function cleaningBlockedUntil(
  checkOutDate: string,
  checkOutTime: string,
  bufferMinutes: number,
): { date: string; time: string; label: string } {
  const { dateOffset, time } = addMinutesToTime(checkOutTime, bufferMinutes);
  const date = dayjs(checkOutDate.slice(0, 10))
    .add(dateOffset, 'day')
    .format('YYYY-MM-DD');
  const label =
    dateOffset === 0
      ? time
      : `${dayjs(date).format('DD/MM')} ${time}`;
  return { date, time, label };
}

/**
 * Local day D overlaps stay [checkInDate checkInTime, checkOutDate checkOutTime).
 */
export function dayOverlapsInterval(
  day: string,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): boolean {
  const dayStart = `${day}T00:00`;
  const dayEnd = `${dayjs(day).add(1, 'day').format('YYYY-MM-DD')}T00:00`;
  const start = `${startDate.slice(0, 10)}T${startTime || '00:00'}`;
  const end = `${endDate.slice(0, 10)}T${endTime || '00:00'}`;
  return start < dayEnd && end > dayStart;
}

/** Occupying beds = adults + children (infants excluded). */
export function occupyingBeds(adults: number, children: number): number {
  return Math.max(0, adults) + Math.max(0, children);
}

export type AgePrices = {
  priceAdult: string | number;
  priceChild: string | number;
  priceInfant: string | number;
};

export type GuestCounts = {
  adults: number;
  children: number;
  infants: number;
};

/**
 * total = (adults×priceAdult + children×priceChild + infants×priceInfant) × nights
 */
export function calcAgeTotal(
  prices: AgePrices,
  counts: GuestCounts,
  nights: number,
): number {
  const adult = Number(prices.priceAdult) || 0;
  const child = Number(prices.priceChild) || 0;
  const infant = Number(prices.priceInfant) || 0;
  if (nights < 1) return 0;
  const nightly =
    adult * Math.max(0, counts.adults) +
    child * Math.max(0, counts.children) +
    infant * Math.max(0, counts.infants);
  return Math.round(nightly * nights * 100) / 100;
}

/** @deprecated use calcAgeTotal — kept for any leftover callers */
export function calcBedTotal(
  pricePerBed: string | number,
  guests: number,
  nights: number,
): number {
  return calcAgeTotal(
    { priceAdult: pricePerBed, priceChild: 0, priceInfant: 0 },
    { adults: guests, children: 0, infants: 0 },
    nights,
  );
}

export function calcDeposit(total: number, depositPercent: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(depositPercent)) return 0;
  return Math.round(((total * depositPercent) / 100) * 100) / 100;
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function isoToDisplayDate(iso: string | undefined | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  const parsed = dayjs(iso);
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== iso) return '';
  return `${d}/${m}/${y}`;
}

/** DD/MM/YYYY (or digits) → YYYY-MM-DD */
export function displayToIsoDate(display: string): string {
  const digits = String(display || '')
    .replace(/\D/g, '')
    .slice(0, 8);
  if (digits.length !== 8) return '';
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const iso = `${year}-${month}-${day}`;
  const parsed = dayjs(iso);
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== iso) return '';
  return iso;
}

export function maskDateInput(raw: string): string {
  const digits = String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(
    Boolean,
  );
  return parts.join('/');
}
