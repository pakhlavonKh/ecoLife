import { TelegramLanguage } from '@prisma/client';

export type TelegramLang = 'ru' | 'uz';

export const DEFAULT_TELEGRAM_LANG: TelegramLang = 'uz';

export function toTelegramLang(
  value: TelegramLanguage | string | null | undefined,
): TelegramLang {
  return value === 'uz' ? 'uz' : 'ru';
}

export function parseTelegramLang(raw: string | undefined): TelegramLang | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'ru' || v === 'uz') return v;
  return null;
}
