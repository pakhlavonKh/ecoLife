import dayjs from 'dayjs';
import i18n, { numberLocale } from '../i18n';

export function formatMoney(value: string | number | null | undefined): string {
  if (value == null || value === '') return i18n.t('common.emDash');
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  const amount = new Intl.NumberFormat(numberLocale(), {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(n);
  return i18n.t('common.money', { amount });
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

/** Half-open stay nights: checkOut − checkIn (days). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const n = dayjs(checkOut).diff(dayjs(checkIn), 'day');
  return n > 0 ? n : 0;
}

/** total = pricePerBed × guests × nights (rounded to 2 dp as number). */
export function calcBedTotal(
  pricePerBed: string | number,
  guests: number,
  nights: number,
): number {
  const price = Number(pricePerBed);
  if (!Number.isFinite(price) || guests < 1 || nights < 1) return 0;
  return Math.round(price * guests * nights * 100) / 100;
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
