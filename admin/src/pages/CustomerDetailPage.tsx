import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { customersApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { CustomerDetail } from '../api/types';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  PaymentBadge,
  StatusBadge,
  TextArea,
} from '../components/ui';
import { formatDate, formatDateTime, formatMoney } from '../lib/format';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    notes: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await customersApi.get(id);
        if (!cancelled) {
          setCustomer(data);
          setForm({
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            notes: data.notes ?? '',
          });
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const { data } = await customersApi.update(id, form);
      setCustomer(data);
      setMessage('Сохранено');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (!customer && !error) {
    return <div className="text-[var(--muted)]">Загрузка…</div>;
  }

  return (
    <div>
      <PageHeader
        title={
          customer
            ? `${customer.firstName} ${customer.lastName}`
            : 'Клиент'
        }
        actions={
          <Link to="/customers">
            <Button variant="secondary">К списку</Button>
          </Link>
        }
      />
      <ErrorBox message={error} />
      {message ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="p-4">
          <form className="space-y-3" onSubmit={onSave}>
            <Field label="Имя">
              <Input
                value={form.firstName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, firstName: e.target.value }))
                }
              />
            </Field>
            <Field label="Фамилия">
              <Input
                value={form.lastName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lastName: e.target.value }))
                }
              />
            </Field>
            <Field label="Телефон">
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </Field>
            <Field label="Заметки">
              <TextArea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </Field>
            <Button type="submit">Сохранить</Button>
          </form>
        </Card>

        <Card>
          <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
            История броней и платежей
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {(customer?.bookings ?? []).map((b) => (
              <li key={b.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/bookings/${b.id}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {b.publicCode}
                  </Link>
                  <StatusBadge status={b.status} />
                  <PaymentBadge status={b.paymentStatus} />
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {formatDate(b.checkIn)} — {formatDate(b.checkOut)} ·{' '}
                  {formatMoney(b.totalAmount)} ·{' '}
                  {b.rooms.map((r) => r.number).join(', ')}
                </div>
                {b.payments.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                    {b.payments.map((p) => (
                      <li key={p.id}>
                        {p.provider} · {formatMoney(p.amount)} · {p.status} ·{' '}
                        {formatDateTime(p.createdAt)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {(customer?.bookings.length ?? 0) === 0 ? (
            <div className="px-4 py-8 text-sm text-[var(--muted)]">
              Нет броней
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
