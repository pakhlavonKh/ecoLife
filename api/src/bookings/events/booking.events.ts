/** Domain events for bookings (Telegram listens in Phase 7). */

export const BOOKING_CREATED_EVENT = 'booking.created';
export const BOOKING_UPDATED_EVENT = 'booking.updated';
export const BOOKING_STATUS_CHANGED_EVENT = 'booking.status_changed';
export const BOOKING_HOLD_EXPIRED_EVENT = 'booking.hold_expired';

export type BookingRoomInfo = {
  number: string;
  cottageName: string;
  categoryCode: string;
  categoryName: string;
  capacity: number;
  bedsBooked: number;
};

export type BookingSnapshot = {
  bookingId: string;
  publicCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  rooms: BookingRoomInfo[];
  bedsTotal: number;
  /** Local calendar date, YYYY-MM-DD. */
  checkIn: string;
  checkOut: string;
  /** Local wall-clock time, HH:mm. */
  checkInTime: string;
  checkOutTime: string;
  priceOriginal: string;
  totalAmount: string;
  depositAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentStatus: string;
  status: string;
  source: string;
  notes: string | null;
};

export type BookingCreatedPayload = BookingSnapshot;

export type BookingFieldChange = {
  field: string;
  from: string;
  to: string;
};

export type BookingUpdatedPayload = {
  bookingId: string;
  publicCode: string;
  changes: BookingFieldChange[];
};

export type BookingStatusChangedPayload = {
  booking: BookingSnapshot;
  previousStatus: string;
  nextStatus: string;
};

export type BookingHoldExpiredPayload = BookingSnapshot;
