type Props = {
  value: string;
  onChange: (hhmm: string) => void;
  required?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Local wall-clock time HH:mm (native time input).
 */
export function TimeField({
  value,
  onChange,
  required,
  id,
  className = '',
  disabled,
}: Props) {
  return (
    <input
      id={id}
      type="time"
      value={value || ''}
      required={required}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] ${className}`}
    />
  );
}
