import { parseLocalDateTime } from '../../common/utils/datetime';
import {
  canAcceptGuests,
  earliestFreeAt,
  hasOverlappingLock,
  maxOccupiedOverStay,
  remainingBeds,
  type OccupancyStay,
} from '../occupancy';

/** Local wall-clock helper — Asia/Tashkent. */
const t = (date: string, time: string) => parseLocalDateTime(date, time);

describe('interval-sweep occupancy + cleaning buffer (HOURLY Phase 2)', () => {
  const buffer = 60;

  it('computes peak concurrent beds over partially overlapping stays', () => {
    // A: Aug1 14:00 → Aug5 12:00 (2 beds), B: Aug3 14:00 → Aug7 12:00 (3 beds)
    const stays: OccupancyStay[] = [
      { checkIn: t('2026-08-01', '14:00'), checkOut: t('2026-08-05', '12:00'), beds: 2 },
      { checkIn: t('2026-08-03', '14:00'), checkOut: t('2026-08-07', '12:00'), beds: 3 },
    ];
    expect(
      maxOccupiedOverStay(
        t('2026-08-01', '14:00'),
        t('2026-08-07', '12:00'),
        stays,
        0,
      ),
    ).toBe(5);
    expect(remainingBeds(7, 5, false)).toBe(2);
    expect(canAcceptGuests(7, 5, 2, false)).toBe(true);
    expect(canAcceptGuests(7, 5, 3, false)).toBe(false);
  });

  it('Variant б: buffer blocks only the released beds, co-occupant unaffected', () => {
    // Room cap 7. A frees 2 beds at Aug5 12:00 → blocked until 13:00.
    // C still lives (3 beds) through Aug10.
    const stays: OccupancyStay[] = [
      {
        checkIn: t('2026-08-01', '14:00'),
        checkOut: t('2026-08-05', '12:00'),
        beds: 2,
      },
      {
        checkIn: t('2026-08-01', '14:00'),
        checkOut: t('2026-08-10', '12:00'),
        beds: 3,
      },
    ];

    // B wants those 2 beds starting 12:30 → still in cleaning → peak = 2+3 = 5,
    // but the 2 from A are still effective → cannot take 2 more? Wait:
    // At 12:30: A effective until 13:00 (2 beds) + C (3) = 5. Remaining = 2.
    // So 2 guests CAN fit at 12:30 if we only look at remaining...
    // Actually Variant б says B cannot take those 2 beds at 12:30 — meaning the
    // released beds are blocked. Remaining capacity at 12:30 = 7 - 5 = 2.
    // Hmm, mathematically 2 beds are "free" of living guests but blocked by
    // cleaning of A's 2 beds. Effective occupancy counts A's 2 during buffer,
    // so remaining = 7-5 = 2. Those 2 free slots are the ones NOT occupied by
    // C and NOT in A's cleaning... Room has 7. C uses 3, A cleaning uses 2,
    // free = 2. So another guest could take 2 different beds?
    //
    // Beds are fungible — there's no bed identity. So "A's released beds are
    // blocked" means we keep counting A's beds during the buffer. The free
    // capacity is capacity - max(effective). At 12:30 free = 2, so a booking
    // for 2 beds is allowed. A booking for 3 is not.
    //
    // The HOURLY example: "A checks out freeing 2 beds at 12:00, B can take
    // those 2 beds at 13:00 not 12:30". That implies B wants exactly those
    // beds when the room would otherwise be full without them.
    //
    // Better scenario: room cap 5. A has 2, C has 3 (=full). After A checks
    // out, without buffer free=2; with buffer free=0 until 13:00.
    const fullRoom: OccupancyStay[] = [
      {
        checkIn: t('2026-08-01', '14:00'),
        checkOut: t('2026-08-05', '12:00'),
        beds: 2,
      },
      {
        checkIn: t('2026-08-01', '14:00'),
        checkOut: t('2026-08-10', '12:00'),
        beds: 3,
      },
    ];
    const capacity = 5;

    // 12:30 — still cleaning A's 2 → occupied 5 → cannot take 2
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '12:30'),
        t('2026-08-06', '12:00'),
        fullRoom,
        buffer,
      ),
    ).toBe(5);
    expect(
      canAcceptGuests(
        capacity,
        maxOccupiedOverStay(
          t('2026-08-05', '12:30'),
          t('2026-08-06', '12:00'),
          fullRoom,
          buffer,
        ),
        2,
        false,
      ),
    ).toBe(false);

    // 13:00 exact — buffer ends (half-open) → occupied only C's 3 → 2 free
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '13:00'),
        t('2026-08-06', '12:00'),
        fullRoom,
        buffer,
      ),
    ).toBe(3);
    expect(
      canAcceptGuests(
        capacity,
        maxOccupiedOverStay(
          t('2026-08-05', '13:00'),
          t('2026-08-06', '12:00'),
          fullRoom,
          buffer,
        ),
        2,
        false,
      ),
    ).toBe(true);

    // C is unaffected: still counted throughout
    expect(
      maxOccupiedOverStay(
        t('2026-08-06', '14:00'),
        t('2026-08-07', '12:00'),
        fullRoom,
        buffer,
      ),
    ).toBe(3);
  });

  it('intraday conflict: B at 10:00 vs A until 12:00 → conflict', () => {
    const stays: OccupancyStay[] = [
      {
        checkIn: t('2026-08-04', '14:00'),
        checkOut: t('2026-08-05', '12:00'),
        beds: 7,
      },
    ];
    // Same calendar day, overlapping times → full
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '10:00'),
        t('2026-08-06', '12:00'),
        stays,
        buffer,
      ),
    ).toBe(7);
    expect(
      canAcceptGuests(
        7,
        maxOccupiedOverStay(
          t('2026-08-05', '10:00'),
          t('2026-08-06', '12:00'),
          stays,
          buffer,
        ),
        1,
        false,
      ),
    ).toBe(false);
  });

  it('back-to-back with exact buffer edge: checkout 12:00 → next at 13:00 is free', () => {
    const stays: OccupancyStay[] = [
      {
        checkIn: t('2026-08-01', '14:00'),
        checkOut: t('2026-08-05', '12:00'),
        beds: 7,
      },
    ];
    // 12:00 start — still in guest stay? Guest stay is [ci, co) so at 12:00
    // guest is gone, but buffer keeps beds until 13:00.
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '12:00'),
        t('2026-08-06', '12:00'),
        stays,
        buffer,
      ),
    ).toBe(7);
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '12:59'),
        t('2026-08-06', '12:00'),
        stays,
        buffer,
      ),
    ).toBe(7);
    // Exactly 13:00 — half-open effective end → free
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '13:00'),
        t('2026-08-06', '12:00'),
        stays,
        buffer,
      ),
    ).toBe(0);
    expect(
      canAcceptGuests(
        7,
        maxOccupiedOverStay(
          t('2026-08-05', '13:00'),
          t('2026-08-06', '12:00'),
          stays,
          buffer,
        ),
        7,
        false,
      ),
    ).toBe(true);
  });

  it('same calendar day without time overlap does not conflict', () => {
    // A: 09:00–11:00 (2 beds). Buffer → free from 12:00.
    // B: 13:00–20:00 (2 beds) — OK on same day.
    const stays: OccupancyStay[] = [
      {
        checkIn: t('2026-08-05', '09:00'),
        checkOut: t('2026-08-05', '11:00'),
        beds: 2,
      },
    ];
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '13:00'),
        t('2026-08-05', '20:00'),
        stays,
        buffer,
      ),
    ).toBe(0);
  });

  it('midnight-crossing stays stay continuous across UTC midnight', () => {
    // Local 23:00 → next day 02:00 crosses UTC midnight (18:00Z → 21:00Z).
    const stays: OccupancyStay[] = [
      {
        checkIn: t('2026-08-05', '23:00'),
        checkOut: t('2026-08-06', '02:00'),
        beds: 4,
      },
    ];
    expect(
      maxOccupiedOverStay(
        t('2026-08-05', '23:30'),
        t('2026-08-06', '01:00'),
        stays,
        0,
      ),
    ).toBe(4);
    // After checkout + buffer (03:00) free
    expect(
      maxOccupiedOverStay(
        t('2026-08-06', '03:00'),
        t('2026-08-06', '10:00'),
        stays,
        buffer,
      ),
    ).toBe(0);
  });

  it('Asia/Tashkent times do not drift (UZT has no DST)', () => {
    const summer = t('2026-07-15', '14:00');
    const winter = t('2026-01-15', '14:00');
    expect(summer.toISOString()).toBe('2026-07-15T09:00:00.000Z');
    expect(winter.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    const stays: OccupancyStay[] = [
      { checkIn: summer, checkOut: t('2026-07-17', '12:00'), beds: 2 },
    ];
    expect(
      maxOccupiedOverStay(summer, t('2026-07-17', '12:00'), stays, 0),
    ).toBe(2);
  });

  it('room lock zeroes remaining; adjacent lock edge is half-open', () => {
    expect(remainingBeds(7, 0, true)).toBe(0);
    expect(canAcceptGuests(7, 0, 1, true)).toBe(false);
    expect(
      hasOverlappingLock(t('2026-08-01', '14:00'), t('2026-08-05', '12:00'), [
        {
          checkIn: t('2026-08-03', '14:00'),
          checkOut: t('2026-08-04', '12:00'),
        },
      ]),
    ).toBe(true);
    expect(
      hasOverlappingLock(t('2026-08-01', '14:00'), t('2026-08-03', '12:00'), [
        {
          checkIn: t('2026-08-03', '12:00'),
          checkOut: t('2026-08-05', '12:00'),
        },
      ]),
    ).toBe(false);
  });

  it('earliestFreeAt returns checkout+buffer when room is full until then', () => {
    const stays: OccupancyStay[] = [
      {
        checkIn: t('2026-08-01', '14:00'),
        checkOut: t('2026-08-05', '12:00'),
        beds: 7,
      },
    ];
    const free = earliestFreeAt(
      7,
      7,
      t('2026-08-05', '10:00'),
      stays,
      buffer,
      false,
    );
    expect(free?.toISOString()).toBe(
      t('2026-08-05', '13:00').toISOString(),
    );
  });

  it('payment-hold-style stays occupy beds until their checkout+buffer', () => {
    // Pending hold that hasn't expired is just another OccupancyStay from the
    // loader's point of view — verify the math treats it like any other booking.
    const stays: OccupancyStay[] = [
      {
        checkIn: t('2026-08-01', '14:00'),
        checkOut: t('2026-08-03', '12:00'),
        beds: 5,
      },
    ];
    expect(
      maxOccupiedOverStay(
        t('2026-08-01', '14:00'),
        t('2026-08-03', '12:00'),
        stays,
        buffer,
      ),
    ).toBe(5);
    expect(
      canAcceptGuests(
        7,
        maxOccupiedOverStay(
          t('2026-08-01', '14:00'),
          t('2026-08-03', '12:00'),
          stays,
          buffer,
        ),
        3,
        false,
      ),
    ).toBe(false);
    expect(
      canAcceptGuests(
        7,
        maxOccupiedOverStay(
          t('2026-08-01', '14:00'),
          t('2026-08-03', '12:00'),
          stays,
          buffer,
        ),
        2,
        false,
      ),
    ).toBe(true);
  });
});
