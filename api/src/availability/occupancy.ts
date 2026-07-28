/**
 * Per-night bed occupancy math (half-open stays [checkIn, checkOut)).
 * Pure functions — unit-tested; used by AvailabilityService inside transactions.
 */

export type OccupancyStay = {
  checkIn: Date;
  checkOut: Date;
  beds: number;
};

/** Nights occupied by a half-open stay, as UTC midnight Dates. */
export function enumerateNights(checkIn: Date, checkOut: Date): Date[] {
  const nights: Date[] = [];
  const cur = new Date(checkIn.getTime());
  while (cur.getTime() < checkOut.getTime()) {
    nights.push(new Date(cur.getTime()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return nights;
}

/** Beds occupied on a single night (UTC calendar date). */
export function bedsOccupiedOnNight(
  night: Date,
  stays: OccupancyStay[],
): number {
  const t = night.getTime();
  let sum = 0;
  for (const stay of stays) {
    if (stay.checkIn.getTime() <= t && t < stay.checkOut.getTime()) {
      sum += stay.beds;
    }
  }
  return sum;
}

/** Max beds occupied on any night of [checkIn, checkOut). */
export function maxOccupiedOverStay(
  checkIn: Date,
  checkOut: Date,
  stays: OccupancyStay[],
): number {
  let max = 0;
  for (const night of enumerateNights(checkIn, checkOut)) {
    max = Math.max(max, bedsOccupiedOnNight(night, stays));
  }
  return max;
}

/**
 * Free beds for the stay window: capacity − max occupancy across nights.
 * A whole-room lock zeroes remaining regardless of beds booked.
 */
export function remainingBeds(
  capacity: number,
  maxOccupied: number,
  locked: boolean,
): number {
  if (locked) {
    return 0;
  }
  return Math.max(0, capacity - maxOccupied);
}

export function canAcceptGuests(
  capacity: number,
  maxOccupied: number,
  guests: number,
  locked: boolean,
): boolean {
  if (guests < 1) {
    return false;
  }
  return remainingBeds(capacity, maxOccupied, locked) >= guests;
}

/** True if any lock stay overlaps [checkIn, checkOut) (half-open). */
export function hasOverlappingLock(
  checkIn: Date,
  checkOut: Date,
  locks: Array<{ checkIn: Date; checkOut: Date }>,
): boolean {
  const a0 = checkIn.getTime();
  const a1 = checkOut.getTime();
  for (const lock of locks) {
    if (lock.checkIn.getTime() < a1 && a0 < lock.checkOut.getTime()) {
      return true;
    }
  }
  return false;
}
