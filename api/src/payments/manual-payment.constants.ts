/** Offline methods an admin may pick when marking a payment. */
export const MANUAL_PAYMENT_PROVIDERS = [
  'cash',
  'card',
  'transfer',
  'terminal',
] as const;

export type ManualPaymentProvider =
  (typeof MANUAL_PAYMENT_PROVIDERS)[number];

export function isManualPaymentProvider(
  value: string,
): value is ManualPaymentProvider {
  return (MANUAL_PAYMENT_PROVIDERS as readonly string[]).includes(value);
}
