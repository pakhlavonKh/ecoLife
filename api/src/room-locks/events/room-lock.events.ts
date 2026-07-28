/** Domain event when admin closes a room entirely for dates. */

export const ROOM_LOCK_CREATED_EVENT = 'room_lock.created';

export type RoomLockCreatedPayload = {
  lockId: string;
  roomId: string;
  roomNumber: string;
  cottageName: string;
  /** Local calendar date, YYYY-MM-DD. */
  checkIn: string;
  checkOut: string;
  /** Local wall-clock time, HH:mm. */
  checkInTime: string;
  checkOutTime: string;
  reason: string | null;
  bookingId: string | null;
};
