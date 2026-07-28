/** Domain event when admin closes a room entirely for dates. */

export const ROOM_LOCK_CREATED_EVENT = 'room_lock.created';

export type RoomLockCreatedPayload = {
  lockId: string;
  roomId: string;
  roomNumber: string;
  cottageName: string;
  checkIn: string;
  checkOut: string;
  reason: string | null;
  bookingId: string | null;
};
