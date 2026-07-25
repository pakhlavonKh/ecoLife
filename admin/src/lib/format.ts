import dayjs from 'dayjs';

export function formatMoney(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(n) + ' UZS';
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('DD.MM.YYYY');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('DD.MM.YYYY HH:mm');
}

export function todayIso(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function addDaysIso(days: number, from = todayIso()): string {
  return dayjs(from).add(days, 'day').format('YYYY-MM-DD');
}
