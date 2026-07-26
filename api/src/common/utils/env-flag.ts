/** Parse common truthy env strings; unset / empty / unknown → `defaultValue`. */
export function envFlag(
  value: string | undefined | null,
  defaultValue = false,
): boolean {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

/** PAYMENTS_ENABLED — default false (pre-request until Payme/Click go live). */
export function isPaymentsEnabled(config: {
  get: (key: string) => unknown;
}): boolean {
  const raw = config.get('PAYMENTS_ENABLED');
  return envFlag(raw == null ? undefined : String(raw), false);
}
