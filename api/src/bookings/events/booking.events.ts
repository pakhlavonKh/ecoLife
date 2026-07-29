/** Domain events for bookings (Telegram listens in Phase 7). */

export const BOOKING_CREATED_EVENT = 'booking.created';
export const BOOKING_UPDATED_EVENT = 'booking.updated';
export const BOOKING_STATUS_CHANGED_EVENT = 'booking.status_changed';
export const BOOKING_HOLD_EXPIRED_EVENT = 'booking.hold_expired';
/** Transfer / upgrade: free old beds from transfer_ts + occupy new segment (TRANSFER.md §5). */
export const BOOKING_TRANSFERRED_EVENT = 'booking.transferred';

export type BookingRoomInfo = {
  number: string;
  cottageName: string;
  categoryCode: string;
  categoryName: string;
  capacity: number;
  bedsBooked: number;
};

/** Stored on bookings.price_breakdown (JSONB). Phase 1 shape; Phase 2 fills on ops. */
export type PriceBreakdownSegment = {
  segmentIndex: number;
  bookingRoomId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  bedsBooked: number;
  amount: string;
  isActive: boolean;
  /** Optional pricing detail for UI / audit (filled from Phase 2). */
  nightlySubtotal?: string;
  nights?: number;
  categoryCode?: string;
  roomNumber?: string;
};

export type PriceBreakdown = {
  version: 1;
  segments: PriceBreakdownSegment[];
  total: string;
  /** Optional surcharge / extend delta from the last transfer/extend op. */
  lastAdjustment?: {
    operation: 'upgrade' | 'transfer' | 'extend';
    amount: string;
    note?: string;
  };
};

export type BookingSnapshot = {
  bookingId: string;
  publicCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  rooms: BookingRoomInfo[];
  bedsTotal: number;
  adults: number;
  children: number;
  infants: number;
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

/** Transfer / upgrade / extend — Telegram + audit (TRANSFER.md §5, Phase 4). */
export type BookingTransferredPayload = {
  booking: BookingSnapshot;
  operation: 'upgrade' | 'transfer' | 'extend';
  /** Local wall clock `YYYY-MM-DD HH:mm` (split instant or extend-from). */
  transferAt: string;
  from: {
    roomId: string;
    roomNumber: string;
    cottageName: string;
    categoryCode: string;
    segmentIndex: number;
  };
  to: {
    roomId: string;
    roomNumber: string;
    cottageName: string;
    categoryCode: string;
    segmentIndex: number;
  };
  /**
   * Beds freed in the OLD room from transferAt.
   * > 0 → mid-stay transfer-out (cleaner notice, NO cleaning buffer).
   * 0 → whole-stay move / same-room extend (no cleaner notice).
   */
  releasedBeds: number;
  /** Surcharge (upgrade) or added nights cost (extend); "0.00" for same-class transfer. */
  surchargeAmount: string;
  priceBreakdown: PriceBreakdown;
  /** Previous check-out before extend (local date + time). */
  previousCheckOut?: string;
  previousCheckOutTime?: string;
};
