import { api } from './client';

/**
 * @param {{
 *   firstName: string,
 *   lastName: string,
 *   phone: string,
 *   roomId: string,
 *   checkIn: string,
 *   checkOut: string,
 *   guests: number,
 *   provider?: 'mock'|'payme'|'click',
 *   notes?: string,
 * }} payload
 */
export async function createBooking(payload) {
  const { data } = await api.post('/api/v1/bookings', payload);
  return data;
}

/** @param {string} publicCode */
export async function fetchBookingByCode(publicCode) {
  const { data } = await api.get(
    `/api/v1/bookings/by-code/${encodeURIComponent(publicCode)}`,
  );
  return data;
}
