import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  displayToIsoDate,
  isoDateOnly,
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

function digitsBefore(value: string, caret: number): number {
  return value.slice(0, Math.max(0, caret)).replace(/\D/g, '').length;
}

/** Place caret after `count` digits in a masked DD/MM/YYYY string. */
function caretAfterDigits(masked: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < masked.length; i++) {
    if (/\d/.test(masked[i])) {
      seen += 1;
      if (seen >= count) return i + 1;
    }
  }
  return masked.length;
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const caretRef = useRef<number | null>(null);
  const [text, setText] = useState(() => isoToDisplayDate(value));

  // Sync from parent only when not editing — avoids jumping the caret to the end.
  useEffect(() => {
    if (focusedRef.current) return;
    setText(isoToDisplayDate(value));
  }, [value]);

  useEffect(() => {
    if (caretRef.current == null) return;
    const el = inputRef.current;
    const pos = caretRef.current;
    caretRef.current = null;
    if (!el) return;
    el.setSelectionRange(pos, pos);
  }, [text]);

  const commit = (raw: string, caret: number) => {
    const masked = maskDateInput(raw);
    caretRef.current = caretAfterDigits(masked, digitsBefore(raw, caret));
    setText(masked);
    const iso = displayToIsoDate(masked);
    if (iso) {
      const minDate = isoDateOnly(min);
      if (minDate && iso < minDate) return;
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
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('dateField.placeholder')}
        value={text}
        required={required}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) =>
          commit(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }
        onBlur={() => {
          focusedRef.current = false;
          const iso = displayToIsoDate(text);
          if (iso) {
            setText(isoToDisplayDate(iso));
            const minDate = isoDateOnly(min);
            if (minDate && iso < minDate) {
              onChange(minDate);
              setText(isoToDisplayDate(minDate));
            } else {
              onChange(iso);
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
        value={isoDateOnly(value)}
        min={isoDateOnly(min) || undefined}
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
