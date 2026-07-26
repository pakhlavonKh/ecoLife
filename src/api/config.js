import { api } from './client';

/**
 * Public runtime flags from the API (single source of truth for PAYMENTS_ENABLED).
 * Falls back to VITE_PAYMENTS_ENABLED, then false.
 */
export async function fetchPublicConfig() {
  const { data } = await api.get('/api/v1/config');
  return data;
}

export function paymentsEnabledFromEnv() {
  const raw = import.meta.env.VITE_PAYMENTS_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return false;
  }
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return false;
}
