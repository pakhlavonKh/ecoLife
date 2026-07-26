import { TelegramStaffRole } from '@prisma/client';
import { DEFAULT_TELEGRAM_LANG, dict, type TelegramLang } from './i18n';

export function telegramRoleLabel(
  role: TelegramStaffRole,
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string {
  return dict(lang).roles[role] ?? role;
}
