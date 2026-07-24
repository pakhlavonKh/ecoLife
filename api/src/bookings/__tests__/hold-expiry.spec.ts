import { BookingStatus } from '@prisma/client';

/**
 * Hold-expiry behaviour: expired pending_payment must not occupy inventory
 * even before the worker flips is_active.
 */
function occupiesInventory(
  status: BookingStatus,
  expiresAt: Date | null,
  now: Date,
): boolean {
  if (
    status === BookingStatus.cancelled ||
    status === BookingStatus.checked_out
  ) {
    return false;
  }
  if (status === BookingStatus.pending_payment) {
    return expiresAt === null || expiresAt > now;
  }
  return (
    status === BookingStatus.deposit_paid ||
    status === BookingStatus.confirmed ||
    status === BookingStatus.checked_in
  );
}

describe('hold expiry occupancy', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('ignores expired pending_payment holds', () => {
    expect(
      occupiesInventory(
        BookingStatus.pending_payment,
        new Date('2026-07-24T11:00:00.000Z'),
        now,
      ),
    ).toBe(false);
  });

  it('counts unexpired pending_payment holds', () => {
    expect(
      occupiesInventory(
        BookingStatus.pending_payment,
        new Date('2026-07-24T13:00:00.000Z'),
        now,
      ),
    ).toBe(true);
  });

  it('counts pending_payment with null expires_at', () => {
    expect(
      occupiesInventory(BookingStatus.pending_payment, null, now),
    ).toBe(true);
  });

  it('keeps deposit_paid occupying even if expires_at is in the past', () => {
    expect(
      occupiesInventory(
        BookingStatus.deposit_paid,
        new Date('2026-07-24T11:00:00.000Z'),
        now,
      ),
    ).toBe(true);
  });

  it('does not occupy cancelled / checked_out', () => {
    expect(occupiesInventory(BookingStatus.cancelled, null, now)).toBe(false);
    expect(occupiesInventory(BookingStatus.checked_out, null, now)).toBe(
      false,
    );
  });
});
