import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, type AppLang } from '../i18n';

export function LangSwitch({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'ru')
    .split('-')[0]
    .toLowerCase() as AppLang;

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md border border-[var(--line)] p-0.5 ${className}`}
      role="group"
      aria-label={t('nav.language')}
    >
      {SUPPORTED_LANGS.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => void i18n.changeLanguage(lng)}
            className={[
              'rounded px-2 py-1 text-xs font-medium uppercase transition',
              active
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]',
            ].join(' ')}
          >
            {lng}
          </button>
        );
      })}
    </div>
  );
}
