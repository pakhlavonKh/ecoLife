import { api } from './client';

/**
 * @param {{
 *   checkIn: string,
 *   checkOut: string,
 *   checkInTime?: string,
 *   checkOutTime?: string,
 *   categoryCode?: string,
 *   guests?: number,
 * }} params
 */
export async function fetchAvailability({
  checkIn,
  checkOut,
  checkInTime,
  checkOutTime,
  categoryCode,
  guests,
}) {
  const { data } = await api.get('/api/v1/availability', {
    params: {
      check_in: checkIn,
      check_out: checkOut,
      ...(checkInTime ? { check_in_time: checkInTime } : {}),
      ...(checkOutTime ? { check_out_time: checkOutTime } : {}),
      ...(categoryCode ? { category_code: categoryCode } : {}),
      ...(guests != null ? { guests } : {}),
    },
  });
  if (typeof data === 'string' || !data || typeof data !== 'object') {
    throw new Error('Invalid availability response');
  }
  return data;
}
