export const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Ожидает оплаты',
  deposit_paid: 'Депозит оплачен',
  confirmed: 'Подтверждена',
  checked_in: 'Заезд',
  checked_out: 'Выезд',
  cancelled: 'Отменена',
};

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Не оплачено',
  deposit_paid: 'Депозит',
  paid_full: 'Полностью',
  refunded: 'Возврат',
};

export const STATUS_ACTIONS: Record<string, string> = {
  deposit_paid: 'Отметить депозит',
  confirmed: 'Подтвердить',
  checked_in: 'Заезд',
  checked_out: 'Выезд',
  cancelled: 'Отменить',
};

export function statusLabel(code: string): string {
  return STATUS_LABELS[code] ?? code;
}

export function paymentLabel(code: string): string {
  return PAYMENT_LABELS[code] ?? code;
}

export const TELEGRAM_ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  manager: 'Менеджер',
  cleaner: 'Уборщица',
};

export function telegramRoleLabel(code: string): string {
  return TELEGRAM_ROLE_LABELS[code] ?? code;
}
