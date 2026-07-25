import { useEffect, useState } from 'react';
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
    const t = setTimeout(() => {
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
      clearTimeout(t);
    };
  }, [search, status, paymentStatus, categoryCode, cottageId, dateFrom, dateTo]);

  return (
    <div>
      <PageHeader
        title="Бронирования"
        subtitle="Поиск, фильтры, ручное создание"
        actions={
          <Link to="/bookings/new">
            <Button>Новая бронь</Button>
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Поиск">
            <Input
              placeholder="Код / имя / телефон"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Статус">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s || 'Все'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Оплата">
            <Select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              {PAYMENTS.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s || 'Все'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Категория">
            <Select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
            >
              <option value="">Все</option>
              {categories.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Коттедж">
            <Select
              value={cottageId}
              onChange={(e) => setCottageId(e.target.value)}
            >
              <option value="">Все</option>
              {cottages.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Дата с">
            <DateField value={dateFrom} onChange={setDateFrom} />
          </Field>
          <Field label="Дата по">
            <DateField value={dateTo} onChange={setDateTo} />
          </Field>
        </div>
      </Card>

      <ErrorBox message={error} />

      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Код</th>
              <th className="px-3 py-3">Гость</th>
              <th className="px-3 py-3">Даты</th>
              <th className="px-3 py-3">Номер</th>
              <th className="px-3 py-3">Сумма</th>
              <th className="px-3 py-3">Статус</th>
              <th className="px-3 py-3">Оплата</th>
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
                  <div className="text-xs text-[var(--muted)]">{b.source}</div>
                </td>
                <td className="px-3 py-3">
                  <div>
                    {b.customer.firstName} {b.customer.lastName}
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
                      {r.number}{' '}
                      <span className="text-[var(--muted)]">
                        ({r.categoryCode})
                      </span>
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
        {!loading && rows.length === 0 ? <Empty>Брони не найдены</Empty> : null}
        {loading ? (
          <div className="px-4 py-8 text-sm text-[var(--muted)]">Загрузка…</div>
        ) : null}
      </Card>
    </div>
  );
}
