import { api } from './client';

/**
 * @param {{ checkIn: string, checkOut: string, categoryCode?: string, guests?: number }} params
 */
export async function fetchAvailability({
  checkIn,
  checkOut,
  categoryCode,
  guests,
}) {
  const { data } = await api.get('/api/v1/availability', {
    params: {
      check_in: checkIn,
      check_out: checkOut,
      ...(categoryCode ? { category_code: categoryCode } : {}),
      ...(guests != null ? { guests } : {}),
    },
  });
  if (typeof data === 'string' || !data || typeof data !== 'object') {
    throw new Error('Invalid availability response');
  }
  return data;
}
