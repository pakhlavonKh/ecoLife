import { BookingStatus } from '@prisma/client';
import {
  canTransition,
  listAllowedTransitions,
  releasesInventory,
} from '../status-machine';

describe('booking status machine', () => {
  it('allows the happy path', () => {
    expect(
      canTransition(
        BookingStatus.pending_payment,
        BookingStatus.deposit_paid,
      ),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.deposit_paid, BookingStatus.confirmed),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.confirmed, BookingStatus.checked_in),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.checked_in, BookingStatus.checked_out),
    ).toBe(true);
  });

  it('allows cancel from any state except checked_out', () => {
    expect(
      canTransition(BookingStatus.pending_payment, BookingStatus.cancelled),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.deposit_paid, BookingStatus.cancelled),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.confirmed, BookingStatus.cancelled),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.checked_in, BookingStatus.cancelled),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.checked_out, BookingStatus.cancelled),
    ).toBe(false);
  });

  it('rejects illegal skips', () => {
    expect(
      canTransition(
        BookingStatus.pending_payment,
        BookingStatus.checked_in,
      ),
    ).toBe(false);
    expect(
      canTransition(BookingStatus.confirmed, BookingStatus.deposit_paid),
    ).toBe(false);
    expect(
      canTransition(BookingStatus.cancelled, BookingStatus.confirmed),
    ).toBe(false);
  });

  it('lists allowed transitions', () => {
    expect(listAllowedTransitions(BookingStatus.checked_out)).toEqual([]);
    expect(listAllowedTransitions(BookingStatus.confirmed)).toEqual([
      BookingStatus.checked_in,
      BookingStatus.cancelled,
    ]);
  });

  it('releases inventory on cancel and check-out', () => {
    expect(releasesInventory(BookingStatus.cancelled)).toBe(true);
    expect(releasesInventory(BookingStatus.checked_out)).toBe(true);
    expect(releasesInventory(BookingStatus.confirmed)).toBe(false);
  });
});
