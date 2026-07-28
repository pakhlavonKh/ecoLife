import { parseIsoDate } from '../../common/utils/dates';
import {
  bedsOccupiedOnNight,
  canAcceptGuests,
  enumerateNights,
  hasOverlappingLock,
  maxOccupiedOverStay,
  remainingBeds,
  type OccupancyStay,
} from '../occupancy';

describe('per-night occupancy (bed mode)', () => {
  const d = (s: string) => parseIsoDate(s);

  /**
   * Partial overlap: stay A [Aug 1, Aug 5) with 2 guests,
   * stay B [Aug 3, Aug 7) with 3 guests, room capacity 7.
   * Nights: 1,2 → 2 occ; 3,4 → 5; 5,6 → 3.
   */
  it('computes occupancy night-by-night for partially overlapping stays', () => {
    const stays: OccupancyStay[] = [
      { checkIn: d('2026-08-01'), checkOut: d('2026-08-05'), beds: 2 },
      { checkIn: d('2026-08-03'), checkOut: d('2026-08-07'), beds: 3 },
    ];

    expect(bedsOccupiedOnNight(d('2026-08-01'), stays)).toBe(2);
    expect(bedsOccupiedOnNight(d('2026-08-02'), stays)).toBe(2);
    expect(bedsOccupiedOnNight(d('2026-08-03'), stays)).toBe(5);
    expect(bedsOccupiedOnNight(d('2026-08-04'), stays)).toBe(5);
    expect(bedsOccupiedOnNight(d('2026-08-05'), stays)).toBe(3);
    expect(bedsOccupiedOnNight(d('2026-08-06'), stays)).toBe(3);
    // checkout day of B is free
    expect(bedsOccupiedOnNight(d('2026-08-07'), stays)).toBe(0);

    expect(
      maxOccupiedOverStay(d('2026-08-01'), d('2026-08-07'), stays),
    ).toBe(5);
    expect(remainingBeds(7, 5, false)).toBe(2);
    expect(canAcceptGuests(7, 5, 2, false)).toBe(true);
    expect(canAcceptGuests(7, 5, 3, false)).toBe(false);
  });

  it('allows sharing a 7-bed room when guests 1–5 and 3–7 fit', () => {
    // A: nights Aug1–4 (2 beds), B: nights Aug3–6 (4 beds) → peak 6 ≤ 7
    const stays: OccupancyStay[] = [
      { checkIn: d('2026-08-01'), checkOut: d('2026-08-05'), beds: 2 },
      { checkIn: d('2026-08-03'), checkOut: d('2026-08-07'), beds: 4 },
    ];
    expect(
      maxOccupiedOverStay(d('2026-08-01'), d('2026-08-07'), stays),
    ).toBe(6);
    expect(canAcceptGuests(7, 6, 1, false)).toBe(true);
    expect(canAcceptGuests(7, 6, 2, false)).toBe(false);
  });

  it('half-open: checkout day frees the bed (adjacent stays OK)', () => {
    const stays: OccupancyStay[] = [
      { checkIn: d('2026-08-01'), checkOut: d('2026-08-10'), beds: 7 },
    ];
    // Guest checking in on Aug 10 sees 0 occupied that night
    expect(bedsOccupiedOnNight(d('2026-08-10'), stays)).toBe(0);
    expect(
      maxOccupiedOverStay(d('2026-08-10'), d('2026-08-12'), stays),
    ).toBe(0);
    expect(canAcceptGuests(7, 0, 7, false)).toBe(true);
  });

  it('room lock zeroes remaining beds regardless of occupancy', () => {
    expect(remainingBeds(7, 0, true)).toBe(0);
    expect(canAcceptGuests(7, 0, 1, true)).toBe(false);
    expect(
      hasOverlappingLock(d('2026-08-01'), d('2026-08-05'), [
        { checkIn: d('2026-08-03'), checkOut: d('2026-08-04') },
      ]),
    ).toBe(true);
    expect(
      hasOverlappingLock(d('2026-08-01'), d('2026-08-03'), [
        { checkIn: d('2026-08-03'), checkOut: d('2026-08-05') },
      ]),
    ).toBe(false);
  });

  it('enumerateNights is half-open', () => {
    const nights = enumerateNights(d('2026-08-01'), d('2026-08-03'));
    expect(nights.map((n) => n.toISOString().slice(0, 10))).toEqual([
      '2026-08-01',
      '2026-08-02',
    ]);
  });
});
