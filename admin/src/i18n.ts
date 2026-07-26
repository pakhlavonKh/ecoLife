import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';

import ru from './locales/ru.json';
import uz from './locales/uz.json';

export const SUPPORTED_LANGS = ['ru', 'uz'] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];

const STORAGE_KEY = 'ecolife_admin_lang';

function syncDayjsLocale(lng: string) {
  dayjs.locale(lng === 'uz' ? 'uz-latn' : 'ru');
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      uz: { translation: uz },
    },
    fallbackLng: 'ru',
    supportedLngs: [...SUPPORTED_LANGS],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: STORAGE_KEY,
    },
  });

syncDayjsLocale(i18n.language);
i18n.on('languageChanged', syncDayjsLocale);

export function resolveAppLang(lng?: string): AppLang {
  const base = (lng ?? i18n.language ?? 'ru').split('-')[0]?.toLowerCase();
  return base === 'uz' ? 'uz' : 'ru';
}

export function numberLocale(lng?: string): string {
  return resolveAppLang(lng) === 'uz' ? 'uz-UZ' : 'ru-RU';
}

export default i18n;
