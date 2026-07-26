import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  displayToIsoDate,
  isoToDisplayDate,
  maskDateInput,
} from '../lib/format';

type Props = {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  required?: boolean;
  id?: string;
  className?: string;
};

/**
 * Text input as DD/MM/YYYY; value/onChange use ISO YYYY-MM-DD for the API.
 */
export function DateField({
  value,
  onChange,
  min,
  required,
  id: idProp,
  className = '',
}: Props) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = idProp || autoId;
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => isoToDisplayDate(value));

  useEffect(() => {
    setText(isoToDisplayDate(value));
  }, [value]);

  const commit = (nextText: string) => {
    const masked = maskDateInput(nextText);
    setText(masked);
    const iso = displayToIsoDate(masked);
    if (iso) {
      if (min && iso < min) return;
      onChange(iso);
    } else if (masked.length === 0) {
      onChange('');
    }
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === 'function') {
      try {
        withPicker.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('dateField.placeholder')}
        value={text}
        required={required}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => {
          const iso = displayToIsoDate(text);
          if (iso) {
            setText(isoToDisplayDate(iso));
            if (min && iso < min) {
              onChange(min);
              setText(isoToDisplayDate(min));
            }
          } else if (text.length > 0 && !iso) {
            setText(isoToDisplayDate(value));
          }
        }}
        className="w-full rounded-md border border-[var(--line)] bg-white py-2 pl-3 pr-10 text-sm outline-none focus:border-[var(--accent)]"
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--accent)]"
        onClick={openPicker}
        aria-label={t('dateField.openCalendarAria')}
        tabIndex={-1}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm12 8H5v10h14V10ZM7 8h10V6H7v2Z"
          />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="pointer-events-none absolute inset-0 opacity-0"
        value={value || ''}
        min={min || undefined}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const iso = e.target.value;
          onChange(iso);
          setText(isoToDisplayDate(iso));
        }}
      />
    </div>
  );
}
