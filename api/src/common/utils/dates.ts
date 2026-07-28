import { BadRequestException } from '@nestjs/common';
import {
  calendarNightsBetween,
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  formatLocalDate,
  formatLocalTime,
  parseLocalDateTime,
  parseTimeOfDay,
} from './datetime';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse YYYY-MM-DD into a UTC calendar date (time 00:00:00.000Z).
 * For stay boundaries prefer `parseLocalDateTime` — stays now carry a real time.
 */
export function parseIsoDate(value: string, field = 'date'): Date {
  if (!DATE_RE.test(value)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new BadRequestException(`${field} is not a valid calendar date`);
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Nights spanned by a stay, counted from local calendar dates — times do not
 * change the price (HOURLY.md §5). Same-day day-use (calendar nights = 0) is
 * charged as 1 night (owner-confirmed default).
 */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const nights = calendarNightsBetween(checkIn, checkOut);
  if (nights === 0 && checkIn.getTime() < checkOut.getTime()) {
    return 1;
  }
  return nights;
}

/**
 * Half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap
 * iff aStart < bEnd && bStart < aEnd.
 * Adjacent stays (checkout instant == next checkin instant) do NOT overlap.
 */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export type StayValidationOptions = {
  minNights?: number;
  maxNights?: number;
  /**
   * Reference "now" for past checks. Defaults to the current instant.
   * Check-in must be >= now (same calendar day with a future time is OK).
   */
  now?: Date;
  /** @deprecated Prefer `now`. Kept so existing tests can pass a frozen clock. */
  today?: Date;
  /** Admin edits of existing stays may keep a past check-in. */
  allowPast?: boolean;
  /** Local wall-clock check-in time, HH:mm. Defaults to 14:00. */
  checkInTime?: string;
  /** Local wall-clock check-out time, HH:mm. Defaults to 12:00. */
  checkOutTime?: string;
};

export type ValidatedStay = {
  /** Absolute check-in instant. */
  checkIn: Date;
  /** Absolute check-out instant (guest's stay is [checkIn, checkOut)). */
  checkOut: Date;
  nights: number;
  /** Local calendar date, YYYY-MM-DD. */
  checkInStr: string;
  checkOutStr: string;
  /** Local wall-clock time, HH:mm. */
  checkInTime: string;
  checkOutTime: string;
};

/**
 * Validate a stay given local dates plus (optional) local times.
 * Returns absolute instants for the availability engine.
 */
export function validateStayDates(
  checkInStr: string,
  checkOutStr: string,
  options: StayValidationOptions = {},
): ValidatedStay {
  const minNights = options.minNights ?? 1;
  const maxNights = options.maxNights ?? 30;
  // Compare against the current instant (not local midnight) so a same-day
  // check-in at 14:00 is rejected when it is already 17:30.
  const now = options.now ?? options.today ?? new Date();

  const checkInTime = parseTimeOfDay(
    options.checkInTime ?? DEFAULT_CHECK_IN_TIME,
    'check_in_time',
  );
  const checkOutTime = parseTimeOfDay(
    options.checkOutTime ?? DEFAULT_CHECK_OUT_TIME,
    'check_out_time',
  );

  const checkIn = parseLocalDateTime(checkInStr, checkInTime, 'check_in');
  const checkOut = parseLocalDateTime(checkOutStr, checkOutTime, 'check_out');

  if (!options.allowPast && checkIn.getTime() < now.getTime()) {
    throw new BadRequestException('check_in must not be in the past');
  }

  if (!(checkIn.getTime() < checkOut.getTime())) {
    throw new BadRequestException('check_in must be before check_out');
  }

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < minNights) {
    throw new BadRequestException(
      `Stay must be at least ${minNights} night(s)`,
    );
  }
  if (nights > maxNights) {
    throw new BadRequestException(
      `Stay must not exceed ${maxNights} night(s)`,
    );
  }

  return {
    checkIn,
    checkOut,
    nights,
    checkInStr: formatLocalDate(checkIn),
    checkOutStr: formatLocalDate(checkOut),
    checkInTime: formatLocalTime(checkIn),
    checkOutTime: formatLocalTime(checkOut),
  };
}
