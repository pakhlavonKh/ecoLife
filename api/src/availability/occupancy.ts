/**
 * Time-resolved bed occupancy (HOURLY.md §2 / Phase 2).
 *
 * Guest stay is half-open [checkIn, checkOut). For availability checks, those
 * beds stay blocked until checkOut + CLEANING_BUFFER_MINUTES (effective interval).
 * Max concurrent usage over a requested window is computed by a sweep over
 * interval endpoints — not per-night buckets — so intraday conflicts are caught.
 */
import { addMinutes, MS_PER_MINUTE } from '../common/utils/datetime';

export type OccupancyStay = {
  checkIn: Date;
  checkOut: Date;
  beds: number;
  /**
   * Transfer-out (TRANSFER.md §5): vacated beds are immediately bookable —
   * no cleaning buffer on this stay's checkOut. Default false = normal checkout.
   */
  skipCleaningBuffer?: boolean;
};

export type EffectiveStay = {
  start: Date;
  /** Exclusive end of the effective (stay + cleaning) interval. */
  end: Date;
  beds: number;
};

/** Effective occupancy interval: [checkIn, checkOut + bufferMinutes).
 * Pass bufferMinutes=0 when stay.skipCleaningBuffer is set (caller responsibility).
 */
export function toEffectiveStay(
  stay: OccupancyStay,
  bufferMinutes: number,
): EffectiveStay {
  const effectiveBuffer = stay.skipCleaningBuffer ? 0 : bufferMinutes;
  return {
    start: stay.checkIn,
    end: addMinutes(stay.checkOut, effectiveBuffer),
    beds: stay.beds,
  };
}

/**
 * Max concurrent beds over the requested half-open window [checkIn, checkOut),
 * treating each stay as [checkIn, checkOut + bufferMinutes).
 *
 * Sweep: seed occupancy at checkIn, then process start(+)/end(−) events inside
 * the window. At an exact timestamp, ends are applied before starts so adjacent
 * half-open intervals do not double-count.
 */
export function maxOccupiedOverStay(
  checkIn: Date,
  checkOut: Date,
  stays: OccupancyStay[],
  bufferMinutes = 0,
): number {
  const reqStart = checkIn.getTime();
  const reqEnd = checkOut.getTime();
  if (!(reqStart < reqEnd)) {
    return 0;
  }

  const bufferMs = Math.max(0, bufferMinutes) * MS_PER_MINUTE;
  const effective = stays
    .map((s) => {
      const stayBufferMs = s.skipCleaningBuffer ? 0 : bufferMs;
      return {
        start: s.checkIn.getTime(),
        end: s.checkOut.getTime() + stayBufferMs,
        beds: s.beds,
      };
    })
    .filter((e) => e.start < reqEnd && e.end > reqStart);

  let current = 0;
  for (const e of effective) {
    if (e.start <= reqStart && reqStart < e.end) {
      current += e.beds;
    }
  }

  type Event = { t: number; delta: number };
  const events: Event[] = [];
  for (const e of effective) {
    if (e.start > reqStart && e.start < reqEnd) {
      events.push({ t: e.start, delta: e.beds });
    }
    if (e.end > reqStart && e.end < reqEnd) {
      events.push({ t: e.end, delta: -e.beds });
    }
  }

  // Same timestamp: process releases (−) before acquisitions (+).
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  let max = current;
  for (const ev of events) {
    current += ev.delta;
    if (current > max) {
      max = current;
    }
  }
  return max;
}

/**
 * Free beds for the stay window: capacity − max concurrent effective occupancy.
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
  options?: { maxExtraCapacity?: number },
): boolean {
  if (locked || guests < 1) {
    return false;
  }
  const maxExtra = options?.maxExtraCapacity ?? 0;
  return remainingBeds(capacity, maxOccupied, locked) + maxExtra >= guests;
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

/**
 * Earliest instant at which `guests` beds become free for a new stay of any
 * length starting then (after cleaning on released beds). Returns null if the
 * room never frees enough within the scanned stays, or `from` if already free.
 *
 * Used later by public "available from HH:MM" hints; kept pure here for tests.
 */
export function earliestFreeAt(
  capacity: number,
  guests: number,
  from: Date,
  stays: OccupancyStay[],
  bufferMinutes: number,
  locked: boolean,
): Date | null {
  if (locked || guests < 1 || guests > capacity) {
    return null;
  }
  if (
    canAcceptGuests(
      capacity,
      maxOccupiedOverStay(
        from,
        addMinutes(from, 1),
        stays,
        bufferMinutes,
      ),
      guests,
      false,
    )
  ) {
    return from;
  }

  const bufferMs = Math.max(0, bufferMinutes) * MS_PER_MINUTE;
  const candidates = new Set<number>([from.getTime()]);
  for (const s of stays) {
    const stayBufferMs = s.skipCleaningBuffer ? 0 : bufferMs;
    candidates.add(s.checkOut.getTime() + stayBufferMs);
  }
  const sorted = [...candidates].filter((t) => t >= from.getTime()).sort((a, b) => a - b);

  for (const t of sorted) {
    const instant = new Date(t);
    const occ = maxOccupiedOverStay(
      instant,
      addMinutes(instant, 1),
      stays,
      bufferMinutes,
    );
    if (canAcceptGuests(capacity, occ, guests, false)) {
      return instant;
    }
  }
  return null;
}
