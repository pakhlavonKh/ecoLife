import {
  formatIsoDate,
  nightsBetween,
  parseIsoDate,
  rangesOverlap,
  validateStayDates,
} from '../../common/utils/dates';

describe('date range overlap (half-open)', () => {
  const d = (s: string) => parseIsoDate(s);

  it('detects overlapping stays', () => {
    expect(rangesOverlap(d('2026-08-01'), d('2026-08-05'), d('2026-08-03'), d('2026-08-07'))).toBe(
      true,
    );
  });

  it('allows checkout day == next checkin day (no overlap)', () => {
    // Guest A: [Aug 1, Aug 10) — checks out Aug 10
    // Guest B: [Aug 10, Aug 15) — checks in Aug 10
    expect(
      rangesOverlap(d('2026-08-01'), d('2026-08-10'), d('2026-08-10'), d('2026-08-15')),
    ).toBe(false);
  });

  it('detects containment overlap', () => {
    expect(
      rangesOverlap(d('2026-08-01'), d('2026-08-10'), d('2026-08-03'), d('2026-08-05')),
    ).toBe(true);
  });

  it('detects identical ranges as overlap', () => {
    expect(
      rangesOverlap(d('2026-08-01'), d('2026-08-05'), d('2026-08-01'), d('2026-08-05')),
    ).toBe(true);
  });

  it('does not overlap when fully before', () => {
    expect(
      rangesOverlap(d('2026-08-01'), d('2026-08-03'), d('2026-08-05'), d('2026-08-07')),
    ).toBe(false);
  });
});

describe('nightsBetween', () => {
  it('counts half-open nights', () => {
    expect(nightsBetween(parseIsoDate('2026-08-01'), parseIsoDate('2026-08-03'))).toBe(2);
  });

  it('charges same-day day-use as 1 night (HOURLY.md §5)', () => {
    const stay = validateStayDates('2026-08-05', '2026-08-05', {
      today: parseIsoDate('2026-07-24'),
      checkInTime: '09:00',
      checkOutTime: '20:00',
    });
    expect(stay.nights).toBe(1);
    expect(stay.checkInTime).toBe('09:00');
    expect(stay.checkOutTime).toBe('20:00');
  });
});

describe('validateStayDates', () => {
  const today = parseIsoDate('2026-07-24');

  it('rejects check_in in the past', () => {
    expect(() =>
      validateStayDates('2026-07-20', '2026-07-22', { today }),
    ).toThrow(/past/i);
  });

  it('rejects check_in >= check_out by instant', () => {
    expect(() =>
      validateStayDates('2026-08-01', '2026-08-01', {
        today,
        checkInTime: '14:00',
        checkOutTime: '14:00',
      }),
    ).toThrow(/before/i);
  });

  it('rejects stays longer than max nights', () => {
    expect(() =>
      validateStayDates('2026-08-01', '2026-09-05', {
        today,
        maxNights: 30,
      }),
    ).toThrow(/30/);
  });

  it('accepts a valid stay', () => {
    const stay = validateStayDates('2026-08-01', '2026-08-03', { today });
    expect(stay.nights).toBe(2);
    expect(formatIsoDate(stay.checkIn)).toBe('2026-08-01');
  });
});
