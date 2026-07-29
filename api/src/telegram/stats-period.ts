import {
  addLocalDays,
  formatLocalDate,
  localParts,
  startOfLocalDay,
  zonedTimeToUtc,
} from '../common/utils/datetime';

export type StatsPeriodPreset = 'day' | 'week' | 'month';

export type StatsDateRange = {
  from: string;
  to: string;
};

const CUSTOM_RANGE_RE =
  /^(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{2})\.(\d{2})\.(\d{4})$/;

function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const instant = zonedTimeToUtc(year, month, day, 0, 0);
  const local = localParts(instant);
  return local.year === year && local.month === month && local.day === day;
}

/** Inclusive local-date range for Day / Week / Month presets. */
export function resolveStatsPresetRange(
  preset: StatsPeriodPreset,
  now = new Date(),
): StatsDateRange {
  const todayStart = startOfLocalDay(now);
  const today = localParts(todayStart);
  const todayStr = formatLocalDate(todayStart);

  if (preset === 'day') {
    return { from: todayStr, to: todayStr };
  }

  if (preset === 'week') {
    const from = formatLocalDate(addLocalDays(todayStart, -6));
    return { from, to: todayStr };
  }

  // Calendar month: 1st → last day of current month.
  const from = ymd(today.year, today.month, 1);
  const firstNextMonth = zonedTimeToUtc(today.year, today.month + 1, 1, 0, 0);
  const lastDay = addLocalDays(firstNextMonth, -1);
  return { from, to: formatLocalDate(lastDay) };
}

/**
 * Parse «ДД.ММ.ГГГГ-ДД.ММ.ГГГГ» (en/em dash allowed).
 * Returns null if invalid or from > to.
 */
export function parseCustomStatsRange(raw: string): StatsDateRange | null {
  const m = CUSTOM_RANGE_RE.exec(String(raw || '').trim());
  if (!m) return null;

  const fromDay = Number(m[1]);
  const fromMonth = Number(m[2]);
  const fromYear = Number(m[3]);
  const toDay = Number(m[4]);
  const toMonth = Number(m[5]);
  const toYear = Number(m[6]);

  if (
    !isValidCalendarDate(fromYear, fromMonth, fromDay) ||
    !isValidCalendarDate(toYear, toMonth, toDay)
  ) {
    return null;
  }

  const from = ymd(fromYear, fromMonth, fromDay);
  const to = ymd(toYear, toMonth, toDay);
  if (from > to) return null;
  return { from, to };
}
