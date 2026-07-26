import i18n from '../i18n';

export const STATUS_CODES = [
  'pending_payment',
  'deposit_paid',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
] as const;

export const PAYMENT_CODES = [
  'unpaid',
  'deposit_paid',
  'paid_full',
  'refunded',
] as const;

export const STATUS_ACTION_CODES = [
  'deposit_paid',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
] as const;

export function statusLabel(code: string): string {
  return i18n.t(`labels.status.${code}`, { defaultValue: code });
}

export function paymentLabel(code: string): string {
  return i18n.t(`labels.payment.${code}`, { defaultValue: code });
}

export function statusActionLabel(code: string): string {
  return i18n.t(`labels.statusActions.${code}`, { defaultValue: code });
}

export function telegramRoleLabel(code: string): string {
  return i18n.t(`labels.telegramRole.${code}`, { defaultValue: code });
}

export function sourceLabel(code: string): string {
  return i18n.t(`labels.source.${code}`, { defaultValue: code });
}

export function paymentProviderLabel(code: string): string {
  return i18n.t(`labels.paymentProvider.${code}`, { defaultValue: code });
}

export function paymentTxnStatusLabel(code: string): string {
  return i18n.t(`labels.paymentTxnStatus.${code}`, { defaultValue: code });
}

/** @deprecated Use statusActionLabel — kept for gradual migration */
export const STATUS_ACTIONS: Record<string, string> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      return statusActionLabel(prop);
    },
  },
);
