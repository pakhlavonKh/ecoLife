import {
  getCleaningBufferMinutes,
  getDefaultCheckInTime,
  getDefaultCheckOutTime,
} from '../booking-time';
import { validateStayDates } from '../dates';
import {
  addLocalDays,
  addMinutes,
  APP_TIME_ZONE,
  calendarNightsBetween,
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
  parseLocalDateTime,
  parseTimeOfDay,
  startOfLocalDay,
  zoneOffsetMs,
} from '../datetime';

const HOUR_MS = 60 * 60 * 1000;

describe('Asia/Tashkent wall-clock conversion', () => {
  it('runs at UTC+05:00 all year (UZT has no DST)', () => {
    expect(APP_TIME_ZONE).toBe('Asia/Tashkent');
    for (const iso of [
      '2026-01-15T00:00:00Z',
      '2026-03-29T00:00:00Z',
      '2026-06-21T00:00:00Z',
      '2026-10-25T00:00:00Z',
    ]) {
      expect(zoneOffsetMs(new Date(iso))).toBe(5 * HOUR_MS);
    }
  });

  it('maps a local wall-clock time to the right UTC instant', () => {
    expect(parseLocalDateTime('2026-08-01', '14:00').toISOString()).toBe(
      '2026-08-01T09:00:00.000Z',
    );
    expect(parseLocalDateTime('2026-08-03', '12:00').toISOString()).toBe(
      '2026-08-03T07:00:00.000Z',
    );
    // 02:00 local is still the same local day even though UTC says the day before.
    const lateNight = parseLocalDateTime('2026-08-02', '02:00');
    expect(lateNight.toISOString()).toBe('2026-08-01T21:00:00.000Z');
    expect(formatLocalDate(lateNight)).toBe('2026-08-02');
    expect(formatLocalTime(lateNight)).toBe('02:00');
  });

  it('round-trips every hour of the day without drift', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const time = `${String(hour).padStart(2, '0')}:30`;
      const instant = parseLocalDateTime('2026-12-31', time);
      expect(formatLocalDateTime(instant)).toBe(`2026-12-31 ${time}`);
    }
  });

  it('startOfLocalDay is local midnight, not UTC midnight', () => {
    const instant = parseLocalDateTime('2026-08-02', '02:00');
    expect(startOfLocalDay(instant).toISOString()).toBe(
      '2026-08-01T19:00:00.000Z',
    );
    expect(formatLocalDateTime(startOfLocalDay(instant))).toBe(
      '2026-08-02 00:00',
    );
  });

  it('addLocalDays keeps the wall-clock time; addMinutes shifts the instant', () => {
    const checkOut = parseLocalDateTime('2026-08-03', '12:00');
    expect(formatLocalDateTime(addLocalDays(checkOut, 1))).toBe(
      '2026-08-04 12:00',
    );
    expect(formatLocalDateTime(addMinutes(checkOut, 60))).toBe(
      '2026-08-03 13:00',
    );
  });

  it('rejects malformed dates and times', () => {
    expect(() => parseLocalDateTime('2026-8-1', '14:00')).toThrow(/YYYY-MM-DD/);
    expect(() => parseLocalDateTime('2026-02-30', '14:00')).toThrow(
      /valid calendar date/,
    );
    expect(() => parseTimeOfDay('24:00')).toThrow(/HH:mm/);
    expect(() => parseTimeOfDay('7:00')).toThrow(/HH:mm/);
    expect(parseTimeOfDay('00:00')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTimeOfDay('23:59')).toEqual({ hours: 23, minutes: 59 });
  });
});

describe('calendarNightsBetween (pricing is night-based, times do not matter)', () => {
  it('counts calendar nights for the default 14:00 → 12:00 stay', () => {
    expect(
      calendarNightsBetween(
        parseLocalDateTime('2026-08-01', '14:00'),
        parseLocalDateTime('2026-08-03', '12:00'),
      ),
    ).toBe(2);
  });

  it('20:00 → next day 10:00 is one night (HOURLY.md §5)', () => {
    expect(
      calendarNightsBetween(
        parseLocalDateTime('2026-08-05', '20:00'),
        parseLocalDateTime('2026-08-06', '10:00'),
      ),
    ).toBe(1);
  });

  it('same local day is zero nights regardless of hours', () => {
    expect(
      calendarNightsBetween(
        parseLocalDateTime('2026-08-05', '09:00'),
        parseLocalDateTime('2026-08-05', '20:00'),
      ),
    ).toBe(0);
  });

  it('counts a stay that crosses midnight UTC but not local midnight', () => {
    // 2026-08-05 23:00 local = 18:00Z; 2026-08-06 01:00 local = 20:00Z.
    expect(
      calendarNightsBetween(
        parseLocalDateTime('2026-08-05', '23:00'),
        parseLocalDateTime('2026-08-06', '01:00'),
      ),
    ).toBe(1);
  });
});

describe('validateStayDates with wall-clock times', () => {
  // Morning of 2026-07-24 — a default 14:00 check-in is still in the future.
  const now = parseLocalDateTime('2026-07-24', '10:00');

  it('applies the 14:00 / 12:00 defaults', () => {
    const stay = validateStayDates('2026-08-01', '2026-08-03', { now });
    expect(stay.checkIn.toISOString()).toBe('2026-08-01T09:00:00.000Z');
    expect(stay.checkOut.toISOString()).toBe('2026-08-03T07:00:00.000Z');
    expect(stay.checkInTime).toBe('14:00');
    expect(stay.checkOutTime).toBe('12:00');
    expect(stay.checkInStr).toBe('2026-08-01');
    expect(stay.checkOutStr).toBe('2026-08-03');
    expect(stay.nights).toBe(2);
  });

  it('honours explicit times without changing the night count', () => {
    const stay = validateStayDates('2026-08-01', '2026-08-03', {
      now,
      checkInTime: '20:30',
      checkOutTime: '09:15',
    });
    expect(stay.checkInTime).toBe('20:30');
    expect(stay.checkOutTime).toBe('09:15');
    expect(stay.nights).toBe(2);
  });

  it('accepts a check-in later today', () => {
    const stay = validateStayDates('2026-07-24', '2026-07-25', { now });
    expect(stay.checkInTime).toBe('14:00');
  });

  it('rejects a same-day check-in whose time has already passed', () => {
    const evening = parseLocalDateTime('2026-07-24', '17:30');
    expect(() =>
      validateStayDates('2026-07-24', '2026-07-25', {
        now: evening,
        checkInTime: '14:00',
      }),
    ).toThrow(/past/i);
  });

  it('accepts a same-day check-in at a still-future time', () => {
    const evening = parseLocalDateTime('2026-07-24', '17:30');
    const stay = validateStayDates('2026-07-24', '2026-07-25', {
      now: evening,
      checkInTime: '18:00',
    });
    expect(stay.checkInTime).toBe('18:00');
  });

  it('still rejects past, inverted and over-long stays', () => {
    expect(() =>
      validateStayDates('2026-07-20', '2026-07-22', { now }),
    ).toThrow(/past/i);
    expect(() =>
      validateStayDates('2026-08-01', '2026-08-01', { now }),
    ).toThrow(/before/i);
    expect(() =>
      validateStayDates('2026-08-01', '2026-09-05', { now, maxNights: 30 }),
    ).toThrow(/30/);
  });

  it('charges same-day day-use as 1 night when times are valid', () => {
    const stay = validateStayDates('2026-08-05', '2026-08-05', {
      now,
      checkInTime: '09:00',
      checkOutTime: '20:00',
    });
    expect(stay.nights).toBe(1);
  });
});

describe('stay-time config', () => {
  const config = (values: Record<string, string>) => ({
    get: (key: string) => values[key],
  });

  it('falls back to 14:00 / 12:00 / 60 minutes', () => {
    const empty = config({});
    expect(getDefaultCheckInTime(empty)).toBe('14:00');
    expect(getDefaultCheckOutTime(empty)).toBe('12:00');
    expect(getCleaningBufferMinutes(empty)).toBe(60);
  });

  it('reads overrides from env', () => {
    const custom = config({
      CHECK_IN_TIME: '15:00',
      CHECK_OUT_TIME: '11:30',
      CLEANING_BUFFER_MINUTES: '90',
    });
    expect(getDefaultCheckInTime(custom)).toBe('15:00');
    expect(getDefaultCheckOutTime(custom)).toBe('11:30');
    expect(getCleaningBufferMinutes(custom)).toBe(90);
  });

  it('allows a disabled buffer but rejects nonsense values', () => {
    expect(getCleaningBufferMinutes(config({ CLEANING_BUFFER_MINUTES: '0' }))).toBe(0);
    expect(() =>
      getCleaningBufferMinutes(config({ CLEANING_BUFFER_MINUTES: '-5' })),
    ).toThrow(/non-negative integer/);
    expect(() =>
      getCleaningBufferMinutes(config({ CLEANING_BUFFER_MINUTES: 'soon' })),
    ).toThrow(/non-negative integer/);
    expect(() => getDefaultCheckInTime(config({ CHECK_IN_TIME: '2pm' }))).toThrow(
      /HH:mm/,
    );
  });
});
