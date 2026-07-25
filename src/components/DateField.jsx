import React, { useEffect, useId, useRef, useState } from 'react';
import {
  displayToIsoDate,
  isoToDisplayDate,
  maskDateInput,
} from '../utils/booking';

/**
 * Date input shown as DD/MM/YYYY; value/onChange use ISO YYYY-MM-DD for the API.
 */
function DateField({ value, min, onChange, required, id: idProp }) {
  const autoId = useId();
  const id = idProp || autoId;
  const pickerRef = useRef(null);
  const [text, setText] = useState(() => isoToDisplayDate(value));

  useEffect(() => {
    setText(isoToDisplayDate(value));
  }, [value]);

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

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div className="date-field">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="дд/мм/гггг"
        value={text}
        required={required}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => {
          const iso = displayToIsoDate(text);
          if (iso) {
            setText(isoToDisplayDate(iso));
            if (min && iso < min) {
              onChange?.(min);
              setText(isoToDisplayDate(min));
            }
          } else if (text.length > 0 && !iso) {
            setText(isoToDisplayDate(value));
          }
        }}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className="visually-hidden">
        Формат: дд/мм/гггг
      </span>
      <button
        type="button"
        className="date-field__picker-btn"
        onClick={openPicker}
        aria-label="Открыть календарь"
        tabIndex={-1}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm12 8H5v10h14V10ZM7 8h10V6H7v2Z"
          />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-field__native"
        value={value || ''}
        min={min || undefined}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const iso = e.target.value;
          onChange?.(iso);
          setText(isoToDisplayDate(iso));
        }}
      />
    </div>
  );
}

export default DateField;
