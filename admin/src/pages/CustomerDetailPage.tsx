import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatGuestName, splitGuestName } from '../lib/guest-name';
import {
  paymentProviderLabel,
  paymentTxnStatusLabel,
} from '../lib/labels';

export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    guestName: '',
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
            guestName: formatGuestName(data.firstName, data.lastName),
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
      const { firstName, lastName } = splitGuestName(form.guestName);
      const { data } = await customersApi.update(id, {
        firstName,
        lastName,
        phone: form.phone,
        notes: form.notes,
      });
      setCustomer(data);
      setMessage(t('common.saved'));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (!customer && !error) {
    return <div className="text-[var(--muted)]">{t('common.loading')}</div>;
  }

  return (
    <div>
      <PageHeader
        title={
          customer
            ? formatGuestName(customer.firstName, customer.lastName)
            : t('customerDetail.fallbackTitle')
        }
        actions={
          <Link to="/customers">
            <Button variant="secondary">{t('common.backToList')}</Button>
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
            <Field label={t('common.guest')}>
              <Input
                value={form.guestName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guestName: e.target.value }))
                }
                placeholder={t('common.guestNamePlaceholder')}
              />
            </Field>
            <Field label={t('common.phone')}>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </Field>
            <Field label={t('common.notes')}>
              <TextArea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </Field>
            <Button type="submit">{t('common.save')}</Button>
          </form>
        </Card>

        <Card>
          <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
            {t('customerDetail.historyTitle')}
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
                  {t('customerDetail.bookingLine', {
                    checkIn: formatDate(b.checkIn),
                    checkOut: formatDate(b.checkOut),
                    total: formatMoney(b.totalAmount),
                    rooms: b.rooms.map((r) => r.number).join(', '),
                  })}
                </div>
                {b.payments.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                    {b.payments.map((p) => (
                      <li key={p.id}>
                        {t('customerDetail.paymentLine', {
                          provider: paymentProviderLabel(p.provider),
                          amount: formatMoney(p.amount),
                          status: paymentTxnStatusLabel(p.status),
                          datetime: formatDateTime(p.createdAt),
                        })}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {(customer?.bookings.length ?? 0) === 0 ? (
            <div className="px-4 py-8 text-sm text-[var(--muted)]">
              {t('customerDetail.emptyBookings')}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
