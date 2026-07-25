import { TelegramStaffRole } from '@prisma/client';

export const TELEGRAM_ROLE_LABELS: Record<TelegramStaffRole, string> = {
  owner: 'владелец',
  admin: 'администратор',
  manager: 'менеджер',
  cleaner: 'уборщица',
};

export function telegramRoleLabel(role: TelegramStaffRole): string {
  return TELEGRAM_ROLE_LABELS[role] ?? role;
}
