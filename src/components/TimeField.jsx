import React, { useId } from 'react';

/**
 * Local wall-clock time HH:mm (native time input, any hour 00:00–23:59).
 * value/onChange use "HH:mm".
 */
function TimeField({ value, onChange, required, id: idProp, disabled }) {
  const autoId = useId();
  const id = idProp || autoId;

  return (
    <input
      id={id}
      type="time"
      className="time-field"
      value={value || ''}
      required={required}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

export default TimeField;
