/**
 * Timezone-aware datetime helpers (HOURLY.md §3).
 *
 * check_in / check_out are stored as TIMESTAMPTZ (absolute instants). Everything a
 * human sees or types is a wall-clock time in the resort's timezone, so all parsing
 * and formatting goes through here instead of the UTC-only helpers in `dates.ts`.
 */
import { BadRequestException } from '@nestjs/common';

/** Resort timezone. UZT is +05:00 year-round (no DST), but never assume it. */
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? 'Asia/Tashkent';

export const DEFAULT_CHECK_IN_TIME = '14:00';
export const DEFAULT_CHECK_OUT_TIME = '12:00';

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type TimeOfDay = { hours: number; minutes: number };

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Wall-clock components of `instant` in APP_TIME_ZONE. */
export function localParts(instant: Date): LocalParts {
  const parts = partsFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Some ICU builds emit hour 24 for midnight.
    hours: get('hour') % 24,
    minutes: get('minute'),
    seconds: get('second'),
  };
}

/** Offset of APP_TIME_ZONE at `instant`, in ms (positive east of UTC). */
export function zoneOffsetMs(instant: Date): number {
  const p = localParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hours, p.minutes, p.seconds);
  // Drop sub-second precision on both sides: zone offsets are whole minutes.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Wall-clock time in APP_TIME_ZONE → absolute instant.
 * Two passes so a DST boundary between guess and result still resolves correctly.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hours, minutes);
  let instant = wall - zoneOffsetMs(new Date(wall));
  instant = wall - zoneOffsetMs(new Date(instant));
  return new Date(instant);
}

export function parseTimeOfDay(value: string, field = 'time'): TimeOfDay {
  if (!TIME_RE.test(value)) {
    throw new BadRequestException(`${field} must be HH:mm (00:00–23:59)`);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return { hours, minutes };
}

/**
 * `YYYY-MM-DD` + `HH:mm` (both local) → absolute instant.
 * `time` defaults to midnight local.
 */
export function parseLocalDateTime(
  dateStr: string,
  time: string | TimeOfDay = { hours: 0, minutes: 0 },
  field = 'date',
): Date {
  if (!DATE_RE.test(dateStr)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const instant = zonedTimeToUtc(year, month, day, 0, 0);
  const local = localParts(instant);
  if (local.year !== year || local.month !== month || local.day !== day) {
    throw new BadRequestException(`${field} is not a valid calendar date`);
  }
  const tod = typeof time === 'string' ? parseTimeOfDay(time, `${field} time`) : time;
  return zonedTimeToUtc(year, month, day, tod.hours, tod.minutes);
}

/** `YYYY-MM-DD` of `instant` in APP_TIME_ZONE. */
export function formatLocalDate(instant: Date): string {
  const p = localParts(instant);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(
    p.day,
  ).padStart(2, '0')}`;
}

/** `HH:mm` of `instant` in APP_TIME_ZONE. */
export function formatLocalTime(instant: Date): string {
  const p = localParts(instant);
  return `${String(p.hours).padStart(2, '0')}:${String(p.minutes).padStart(2, '0')}`;
}

/** `YYYY-MM-DD HH:mm` of `instant` in APP_TIME_ZONE. */
export function formatLocalDateTime(instant: Date): string {
  return `${formatLocalDate(instant)} ${formatLocalTime(instant)}`;
}

/** Midnight (local) starting the day that contains `instant`. */
export function startOfLocalDay(instant: Date): Date {
  const p = localParts(instant);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0);
}

/** Same wall-clock time `days` later — safe across DST unlike adding 24h. */
export function addLocalDays(instant: Date, days: number): Date {
  const p = localParts(instant);
  return zonedTimeToUtc(p.year, p.month, p.day + days, p.hours, p.minutes);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}

/**
 * Calendar nights spanned, from the local DATE parts only (HOURLY.md §5):
 * check-in 5th 20:00 → check-out 6th 10:00 is 1 night, same as 14:00 → 12:00.
 */
export function calendarNightsBetween(checkIn: Date, checkOut: Date): number {
  const a = startOfLocalDay(checkIn).getTime();
  const b = startOfLocalDay(checkOut).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}
