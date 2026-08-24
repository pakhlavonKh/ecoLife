import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { formatMoneyInput } from '../lib/format';

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string | number | null | undefined;
  onValueChange?: (formattedValue: string) => void;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Calculates the caret/cursor position in the formatted string corresponding to
 * the same number of digits that were to the left of the caret in the raw input.
 */
export function calculateCursorPosition(
  rawInputVal: string,
  cursorPosInRaw: number,
  formattedVal: string,
): number {
  const digitsBefore = rawInputVal
    .slice(0, cursorPosInRaw)
    .replace(/\D/g, '').length;

  if (digitsBefore === 0) return 0;

  let count = 0;
  for (let i = 0; i < formattedVal.length; i++) {
    if (/\d/.test(formattedVal[i])) {
      count++;
      if (count === digitsBefore) {
        return i + 1;
      }
    }
  }

  return formattedVal.length;
}

const controlClass =
  'w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]';

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    {
      value,
      onValueChange,
      onChange,
      onKeyDown,
      className = '',
      inputMode = 'numeric',
      ...rest
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const cursorRef = useRef<number | null>(null);

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const displayValue = value == null ? '' : typeof value === 'string' ? value : formatMoneyInput(value);

    useLayoutEffect(() => {
      if (cursorRef.current !== null && inputRef.current) {
        const targetPos = Math.min(
          cursorRef.current,
          inputRef.current.value.length,
        );
        inputRef.current.setSelectionRange(targetPos, targetPos);
        cursorRef.current = null;
      }
    });

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const rawVal = e.target.value;
      const rawCursor = e.target.selectionStart ?? rawVal.length;
      const formatted = formatMoneyInput(rawVal);

      const nextCursor = calculateCursorPosition(rawVal, rawCursor, formatted);
      cursorRef.current = nextCursor;

      if (onValueChange) {
        onValueChange(formatted);
      }
      if (onChange) {
        e.target.value = formatted;
        onChange(e);
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      const input = e.currentTarget;
      const { selectionStart, selectionEnd } = input;
      if (selectionStart == null || selectionEnd == null) return;

      // Smart Backspace handling across space separators
      if (
        e.key === 'Backspace' &&
        selectionStart === selectionEnd &&
        selectionStart > 0
      ) {
        if (input.value[selectionStart - 1] === ' ') {
          e.preventDefault();
          const spacePos = selectionStart - 1;
          const currentVal = input.value;
          if (spacePos > 0) {
            // Delete the digit before the space
            const rawAfterDelete =
              currentVal.slice(0, spacePos - 1) + currentVal.slice(selectionStart);
            const formatted = formatMoneyInput(rawAfterDelete);
            const nextCursor = calculateCursorPosition(
              rawAfterDelete,
              spacePos - 1,
              formatted,
            );
            cursorRef.current = nextCursor;
            if (onValueChange) onValueChange(formatted);
            if (onChange) {
              const synthetic = {
                ...e,
                target: input,
                currentTarget: input,
              } as unknown as ChangeEvent<HTMLInputElement>;
              input.value = formatted;
              onChange(synthetic);
            }
          }
        }
      } else if (
        e.key === 'Delete' &&
        selectionStart === selectionEnd &&
        selectionStart < input.value.length
      ) {
        // Smart Delete handling across space separators
        if (input.value[selectionStart] === ' ') {
          e.preventDefault();
          const digitPos = selectionStart + 1;
          const currentVal = input.value;
          if (digitPos < currentVal.length) {
            const rawAfterDelete =
              currentVal.slice(0, selectionStart) +
              currentVal.slice(digitPos + 1);
            const formatted = formatMoneyInput(rawAfterDelete);
            const nextCursor = calculateCursorPosition(
              rawAfterDelete,
              selectionStart,
              formatted,
            );
            cursorRef.current = nextCursor;
            if (onValueChange) onValueChange(formatted);
            if (onChange) {
              const synthetic = {
                ...e,
                target: input,
                currentTarget: input,
              } as unknown as ChangeEvent<HTMLInputElement>;
              input.value = formatted;
              onChange(synthetic);
            }
          }
        }
      }
    };

    return (
      <input
        ref={inputRef}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        inputMode={inputMode}
        className={`${controlClass} ${className}`}
        {...rest}
      />
    );
  },
);
