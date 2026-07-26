import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  displayToIsoDate,
  isoToDisplayDate,
  maskDateInput,
  todayStr,
} from '../utils/booking';

const WEEKDAY_KEYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

function buildMonthCells(month) {
  const start = month.startOf('month');
  // Monday-first grid
  const pad = (start.day() + 6) % 7;
  const cells = [];
  for (let i = 0; i < pad; i += 1) {
    cells.push(null);
  }
  for (let d = 1; d <= start.daysInMonth(); d += 1) {
    cells.push(start.date(d));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

/**
 * Premium date field: DD/MM/YYYY text + custom calendar popover (no native picker).
 * value/onChange use ISO YYYY-MM-DD.
 */
function DateField({ value, min, onChange, required, id: idProp }) {
  const { t, i18n } = useTranslation();
  const autoId = useId();
  const id = idProp || autoId;
  const rootRef = useRef(null);
  const [text, setText] = useState(() => isoToDisplayDate(value));
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    dayjs(value || min || todayStr()).startOf('month'),
  );

  const locale = i18n.language?.startsWith('uz')
    ? 'uz'
    : i18n.language?.startsWith('en')
      ? 'en'
      : 'ru';

  useEffect(() => {
    setText(isoToDisplayDate(value));
    if (value) {
      setViewMonth(dayjs(value).startOf('month'));
    }
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (nextText) => {
    const masked = maskDateInput(nextText);
    setText(masked);
    const iso = displayToIsoDate(masked);
    if (iso) {
      if (min && iso < min) return;
      onChange?.(iso);
    } else if (masked.length === 0) {
      onChange?.('');
    }
  };

  const minDay = min ? dayjs(min) : null;
  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const monthLabel = viewMonth
    .toDate()
    .toLocaleDateString(
      locale === 'uz' ? 'uz-UZ' : locale === 'en' ? 'en-US' : 'ru-RU',
      { month: 'long', year: 'numeric' },
    );

  const pick = (iso) => {
    if (min && iso < min) return;
    onChange?.(iso);
    setText(isoToDisplayDate(iso));
    setOpen(false);
  };

  return (
    <div className="date-field" ref={rootRef}>
      <button
        type="button"
        className="date-field__trigger"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={value ? '' : 'date-field__placeholder'}>
          {text || t('dateField.placeholder')}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm12 8H5v10h14V10ZM7 8h10V6H7v2Z"
          />
        </svg>
      </button>

      {/* Hidden for form validation / progressive enhancement */}
      <input
        type="text"
        className="visually-hidden"
        tabIndex={-1}
        value={text}
        required={required}
        readOnly
        onChange={() => {}}
        aria-hidden="true"
      />

      {open ? (
        <div
          className="date-cal"
          role="dialog"
          aria-label={t('dateField.openCalendarAria')}
        >
          <div className="date-cal__head">
            <button
              type="button"
              className="date-cal__nav"
              aria-label={t('dateField.prevMonth')}
              onClick={() => setViewMonth((m) => m.subtract(1, 'month'))}
            >
              ‹
            </button>
            <p className="date-cal__month">{monthLabel}</p>
            <button
              type="button"
              className="date-cal__nav"
              aria-label={t('dateField.nextMonth')}
              onClick={() => setViewMonth((m) => m.add(1, 'month'))}
            >
              ›
            </button>
          </div>

          <div className="date-cal__weekdays">
            {WEEKDAY_KEYS.map((key) => (
              <span key={key}>{t(`dateField.weekdays.${key}`)}</span>
            ))}
          </div>

          <div className="date-cal__grid">
            {cells.map((day, idx) => {
              if (!day) {
                return <span key={`e-${idx}`} className="date-cal__empty" />;
              }
              const iso = day.format('YYYY-MM-DD');
              const disabled = Boolean(minDay && day.isBefore(minDay, 'day'));
              const selected = value === iso;
              const isToday = iso === todayStr();
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    'date-cal__day',
                    selected ? 'is-selected' : '',
                    isToday ? 'is-today' : '',
                    disabled ? 'is-disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={disabled}
                  onClick={() => pick(iso)}
                >
                  {day.date()}
                </button>
              );
            })}
          </div>

          <div className="date-cal__manual">
            <label htmlFor={`${id}-typed`}>
              <span className="visually-hidden">{t('dateField.placeholder')}</span>
              <input
                id={`${id}-typed`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('dateField.placeholder')}
                value={text}
                onChange={(e) => commit(e.target.value)}
                onBlur={() => {
                  const iso = displayToIsoDate(text);
                  if (iso) {
                    setText(isoToDisplayDate(iso));
                    if (min && iso < min) {
                      onChange?.(min);
                      setText(isoToDisplayDate(min));
                    } else {
                      onChange?.(iso);
                      setOpen(false);
                    }
                  } else if (text.length > 0) {
                    setText(isoToDisplayDate(value));
                  }
                }}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DateField;
