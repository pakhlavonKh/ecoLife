import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { paymentLabel, statusLabel } from '../lib/labels';
import { MoneyInput, type MoneyInputProps } from './MoneyInput';

export { MoneyInput, type MoneyInputProps };

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  const styles = {
    primary:
      'bg-[var(--accent)] text-white hover:brightness-105 disabled:opacity-50',
    secondary:
      'border border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--bg)]',
    danger: 'bg-[var(--danger)] text-white hover:brightness-105',
    ghost: 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]',
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const control =
  'w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${control} ${className}`} {...props} />;
  },
);

export function Select({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${control} ${className}`} {...props} />;
}

export function TextArea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={`${control} min-h-24 ${className}`} {...props} />
  );
}

export function StatusBadge({ status }: { status: string }) {
  useTranslation();
  const tone =
    status === 'cancelled'
      ? 'bg-red-50 text-red-700'
      : status === 'checked_in'
        ? 'bg-emerald-50 text-emerald-800'
        : status === 'pending_payment'
          ? 'bg-amber-50 text-amber-800'
          : 'bg-[var(--accent-soft)] text-[var(--accent)]';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

export function PaymentBadge({ status }: { status: string }) {
  useTranslation();
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
      {paymentLabel(status)}
    </span>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">
      {children}
    </div>
  );
}
