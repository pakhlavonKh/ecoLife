import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { bookingsApi, inventoryApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { Booking, Category, Cottage } from '../api/types';
import { DateField } from '../components/DateField';
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  PaymentBadge,
  Select,
  StatusBadge,
} from '../components/ui';
import { formatDate, formatMoney } from '../lib/format';
import { formatGuestName } from '../lib/guest-name';
import { sourceLabel } from '../lib/labels';

const STATUSES = [
  '',
  'pending_payment',
  'deposit_paid',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
];
const PAYMENTS = ['', 'unpaid', 'deposit_paid', 'paid_full', 'refunded'];

export function BookingsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Booking[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cottages, setCottages] = useState<Cottage[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [cottageId, setCottageId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      inventoryApi.categories(),
      inventoryApi.cottages(),
    ]).then(([c, ct]) => {
      setCategories(c.data);
      setCottages(ct.data);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        setLoading(true);
        try {
          const { data } = await bookingsApi.list({
            search: search || undefined,
            status: status || undefined,
            paymentStatus: paymentStatus || undefined,
            categoryCode: categoryCode || undefined,
            cottageId: cottageId || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          });
          if (!cancelled) {
            setRows(data);
            setError('');
          }
        } catch (err) {
          if (!cancelled) setError(getErrorMessage(err));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, status, paymentStatus, categoryCode, cottageId, dateFrom, dateTo]);

  return (
    <div>
      <PageHeader
        title={t('bookings.title')}
        subtitle={t('bookings.subtitle')}
        actions={
          <Link to="/bookings/new">
            <Button>{t('bookings.newBooking')}</Button>
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label={t('common.search')}>
            <Input
              placeholder={t('bookings.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label={t('common.status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s ? t(`labels.status.${s}`) : t('common.all')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.payment')}>
            <Select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              {PAYMENTS.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s ? t(`labels.payment.${s}`) : t('common.all')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.category')}>
            <Select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.cottage')}>
            <Select
              value={cottageId}
              onChange={(e) => setCottageId(e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {cottages.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('bookings.dateFrom')}>
            <DateField value={dateFrom} onChange={setDateFrom} />
          </Field>
          <Field label={t('bookings.dateTo')}>
            <DateField value={dateTo} onChange={setDateTo} />
          </Field>
        </div>
      </Card>

      <ErrorBox message={error} />

      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">{t('bookings.colCode')}</th>
              <th className="px-3 py-3">{t('bookings.colGuest')}</th>
              <th className="px-3 py-3">{t('bookings.colDates')}</th>
              <th className="px-3 py-3">{t('bookings.colRoom')}</th>
              <th className="px-3 py-3">{t('bookings.colAmount')}</th>
              <th className="px-3 py-3">{t('bookings.colStatus')}</th>
              <th className="px-3 py-3">{t('bookings.colPayment')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr
                key={b.id}
                className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg)]/60"
              >
                <td className="px-3 py-3">
                  <Link
                    to={`/bookings/${b.id}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {b.publicCode}
                  </Link>
                  <div
                    className={
                      b.source === 'online_request'
                        ? 'text-xs font-medium text-amber-700'
                        : 'text-xs text-[var(--muted)]'
                    }
                  >
                    {sourceLabel(b.source)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div>
                    {formatGuestName(
                      b.customer.firstName,
                      b.customer.lastName,
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {b.customer.phone}
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {formatDate(b.checkIn)} — {formatDate(b.checkOut)}
                </td>
                <td className="px-3 py-3">
                  {b.rooms.map((r) => (
                    <div key={r.bookingRoomId}>
                      {t('bookings.roomWithCategory', {
                        number: r.number,
                        categoryCode: r.categoryCode,
                      })}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {formatMoney(b.totalAmount)}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={b.status} />
                </td>
                <td className="px-3 py-3">
                  <PaymentBadge status={b.paymentStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <Empty>{t('bookings.empty')}</Empty>
        ) : null}
        {loading ? (
          <div className="px-4 py-8 text-sm text-[var(--muted)]">
            {t('common.loading')}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
