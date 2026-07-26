import {
  DEFAULT_TELEGRAM_LANG,
  type TelegramLang,
  toTelegramLang,
} from './telegram.lang';
import { ru, type TelegramDict } from './locales/ru';
import { uz } from './locales/uz';

export type { TelegramLang, TelegramDict };
export {
  DEFAULT_TELEGRAM_LANG,
  toTelegramLang,
  parseTelegramLang,
} from './telegram.lang';

const DICTS: Record<TelegramLang, TelegramDict> = { ru, uz };

type DeepStringPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends Record<string, unknown>
      ? DeepStringPaths<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

export type TelegramMessageKey = DeepStringPaths<TelegramDict>;

function getPath(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function dict(lang: TelegramLang = DEFAULT_TELEGRAM_LANG): TelegramDict {
  return DICTS[lang] ?? DICTS.ru;
}

export function tt(
  lang: TelegramLang,
  key: TelegramMessageKey,
  vars?: Record<string, string | number>,
): string {
  const template =
    getPath(DICTS[lang], key) ?? getPath(DICTS.ru, key) ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(vars[name] ?? ''),
  );
}
