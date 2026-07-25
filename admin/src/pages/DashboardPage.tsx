import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { DashboardStats } from '../api/types';
import { Card, ErrorBox, Field, Input, PageHeader, StatusBadge } from '../components/ui';
import { formatMoney, todayIso } from '../lib/format';

export function DashboardPage() {
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
        { label: 'Заезды сегодня', value: String(data.arrivalsToday) },
        { label: 'Выезды сегодня', value: String(data.departuresToday) },
        { label: 'В доме', value: String(data.activeGuests) },
        { label: 'Будущие брони', value: String(data.upcomingBookings) },
        { label: 'Всего броней', value: String(data.totalBookings) },
        {
          label: 'Загрузка сегодня',
          value: `${data.occupancyPercent}%`,
          hint: `${data.occupiedBeds} / ${data.totalBeds} мест`,
        },
        { label: 'Выручка за период', value: formatMoney(data.revenue) },
        { label: 'Ожидают оплаты', value: String(data.pendingPayments) },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Дашборд"
        subtitle={data ? `Сегодня: ${data.today}` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Field label="С">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="По">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
            Заезды сегодня
          </div>
          <List items={data?.arrivalsList ?? []} />
        </Card>
        <Card>
          <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
            Выезды сегодня
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
  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-sm text-[var(--muted)]">Нет записей</div>
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
