import { BookingStatus } from '@prisma/client';

/**
 * Legal status transitions (§8 / §5).
 * Cancellation allowed from any state except checked_out.
 */
const ALLOWED: Record<BookingStatus, readonly BookingStatus[]> = {
  [BookingStatus.pending_payment]: [
    BookingStatus.deposit_paid,
    BookingStatus.cancelled,
  ],
  [BookingStatus.deposit_paid]: [
    BookingStatus.confirmed,
    BookingStatus.cancelled,
  ],
  [BookingStatus.confirmed]: [
    BookingStatus.checked_in,
    BookingStatus.cancelled,
  ],
  [BookingStatus.checked_in]: [
    BookingStatus.checked_out,
    BookingStatus.cancelled,
  ],
  [BookingStatus.checked_out]: [],
  [BookingStatus.cancelled]: [],
};

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  if (from === to) {
    return false;
  }
  return ALLOWED[from].includes(to);
}

export function assertTransition(
  from: BookingStatus,
  to: BookingStatus,
): void {
  if (!canTransition(from, to)) {
    const err = new Error(
      `Illegal status transition: ${from} → ${to}`,
    ) as Error & { statusCode: number };
    err.statusCode = 422;
    throw err;
  }
}

export function listAllowedTransitions(
  from: BookingStatus,
): readonly BookingStatus[] {
  return ALLOWED[from];
}

/** Statuses that occupy inventory (when hold not expired). */
export const OCCUPYING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.pending_payment,
  BookingStatus.deposit_paid,
  BookingStatus.confirmed,
  BookingStatus.checked_in,
];

/** After this transition, booking_rooms.is_active must become false. */
export function releasesInventory(to: BookingStatus): boolean {
  return (
    to === BookingStatus.cancelled || to === BookingStatus.checked_out
  );
}
