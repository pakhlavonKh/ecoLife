import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { DashboardStats } from '../api/types';
import { DateField } from '../components/DateField';
import { Card, ErrorBox, Field, PageHeader, StatusBadge } from '../components/ui';
import { formatDate, formatMoney, todayIso } from '../lib/format';

export function DashboardPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [to, setTo] = useState(todayIso());
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: stats } = await dashboardApi.get(from, to);
        if (!cancelled) {
          setData(stats);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const cards = data
    ? [
        { label: t('dashboard.arrivalsToday'), value: String(data.arrivalsToday) },
        {
          label: t('dashboard.departuresToday'),
          value: String(data.departuresToday),
        },
        { label: t('dashboard.activeGuests'), value: String(data.activeGuests) },
        {
          label: t('dashboard.upcomingBookings'),
          value: String(data.upcomingBookings),
        },
        {
          label: t('dashboard.totalBookings'),
          value: String(data.totalBookings),
        },
        {
          label: t('dashboard.occupancyToday'),
          value: `${data.occupancyPercent}%`,
          hint: t('dashboard.bedsHint', {
            occupied: data.occupiedBeds,
            total: data.totalBeds,
          }),
        },
        {
          label: t('dashboard.revenuePeriod'),
          value: formatMoney(data.revenue),
        },
        {
          label: t('dashboard.pendingPayments'),
          value: String(data.pendingPayments),
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={
          data
            ? t('dashboard.todaySubtitle', { date: formatDate(data.today) })
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Field label={t('common.from')}>
              <DateField value={from} onChange={setFrom} />
            </Field>
            <Field label={t('common.to')}>
              <DateField value={to} onChange={setTo} />
            </Field>
          </div>
        }
      />
      <ErrorBox message={error} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {c.label}
            </div>
            <div className="mt-2 text-2xl font-semibold">{c.value}</div>
            {c.hint ? (
              <div className="mt-1 text-xs text-[var(--muted)]">{c.hint}</div>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
            {t('dashboard.arrivalsToday')}
          </div>
          <List items={data?.arrivalsList ?? []} />
        </Card>
        <Card>
          <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
            {t('dashboard.departuresToday')}
          </div>
          <List items={data?.departuresList ?? []} />
        </Card>
      </div>
    </div>
  );
}

function List({
  items,
}: {
  items: DashboardStats['arrivalsList'];
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-sm text-[var(--muted)]">
        {t('dashboard.emptyList')}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((item) => (
        <li key={item.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to={`/bookings/${item.id}`}
              className="font-medium text-[var(--accent)] hover:underline"
            >
              {item.publicCode}
            </Link>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-1 text-sm">
            {item.customerName} · {item.phone}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {item.rooms.join(', ')}
          </div>
        </li>
      ))}
    </ul>
  );
}
