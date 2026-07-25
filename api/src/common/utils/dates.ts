import { BadRequestException } from '@nestjs/common';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse YYYY-MM-DD into a UTC calendar date (time 00:00:00.000Z). */
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

/** Half-open stay nights: [checkIn, checkOut). */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const ms = checkOut.getTime() - checkIn.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap
 * iff aStart < bEnd && bStart < aEnd.
 * Adjacent stays (checkout == next checkin) do NOT overlap.
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
  /** Calendar "today" in UTC (YYYY-MM-DD as Date). Defaults to UTC today. */
  today?: Date;
  /** Admin edits of existing stays may keep a past check-in. */
  allowPast?: boolean;
}

export type ValidatedStay = {
  checkIn: Date;
  checkOut: Date;
  nights: number;
  checkInStr: string;
  checkOutStr: string;
};

export function validateStayDates(
  checkInStr: string,
  checkOutStr: string,
  options: StayValidationOptions = {},
): ValidatedStay {
  const minNights = options.minNights ?? 1;
  const maxNights = options.maxNights ?? 30;
  const today =
    options.today ??
    parseIsoDate(formatIsoDate(new Date()));

  const checkIn = parseIsoDate(checkInStr, 'check_in');
  const checkOut = parseIsoDate(checkOutStr, 'check_out');

  if (!options.allowPast && checkIn.getTime() < today.getTime()) {
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
    checkInStr: formatIsoDate(checkIn),
    checkOutStr: formatIsoDate(checkOut),
  };
}
