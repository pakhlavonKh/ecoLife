import { api } from './client';

/**
 * Register card and trigger OTP sent to user's phone.
 * @param {{ number: string, expire: string }} payload
 * @returns {Promise<{ token: string, verify: boolean, phone: string | null }>}
 */
export async function paymeCreateCard(payload) {
  const { data } = await api.post('/api/v1/payments/payme/cards/create', payload);
  return data;
}

/**
 * Verify card (if code provided) and pay receipt.
 * @param {{ paymentId: string, token: string, code?: string }} payload
 * @returns {Promise<{ success: boolean, bookingCode: string }>}
 */
export async function paymePayReceipt(payload) {
  const { data } = await api.post('/api/v1/payments/payme/receipts/pay', payload);
  return data;
}
