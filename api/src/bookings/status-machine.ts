import { BookingStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

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

/**
 * Check-out is forbidden while the guest still owes money:
 * remaining_amount > 0 → the admin must record the payment first.
 */
export function isCheckOutBlockedByDebt(
  to: BookingStatus,
  remainingAmount: Decimal,
): boolean {
  return to === BookingStatus.checked_out && remainingAmount.gt(0);
}

/** "1234567.00" → "1 234 567 UZS" (for human-facing error messages). */
export function formatDebtUzs(amount: Decimal): string {
  const fixed = amount.toFixed(2).replace(/\.00$/, '');
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${frac ? `${grouped}.${frac}` : grouped} UZS`;
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
