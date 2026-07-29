import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dashboardApi, exportsApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { DashboardStats } from '../api/types';
import { DateField } from '../components/DateField';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  PageHeader,
  Select,
  StatusBadge,
} from '../components/ui';
import {
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  formatDate,
  formatMoney,
  todayIso,
} from '../lib/format';

type SortDir = 'asc' | 'desc';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DashboardPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [to, setTo] = useState(todayIso());
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [arrivalSort, setArrivalSort] = useState<SortDir>('asc');
  const [departureSort, setDepartureSort] = useState<SortDir>('asc');

  const [mealOpen, setMealOpen] = useState(false);
  const [mealFrom, setMealFrom] = useState(todayIso);
  const [mealTo, setMealTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [mealFormat, setMealFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [mealBusy, setMealBusy] = useState(false);
  const [mealError, setMealError] = useState('');

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

  const arrivals = useMemo(() => {
    const list = [...(data?.arrivalsList ?? [])];
    list.sort((a, b) => {
      const ta = a.checkInAt ?? `${a.checkIn}T${a.checkInTime ?? '00:00'}`;
      const tb = b.checkInAt ?? `${b.checkIn}T${b.checkInTime ?? '00:00'}`;
      const cmp = ta.localeCompare(tb);
      return arrivalSort === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data?.arrivalsList, arrivalSort]);

  const departures = useMemo(() => {
    const list = [...(data?.departuresList ?? [])];
    list.sort((a, b) => {
      const ta = a.checkOutAt ?? `${a.checkOut}T${a.checkOutTime ?? '00:00'}`;
      const tb = b.checkOutAt ?? `${b.checkOut}T${b.checkOutTime ?? '00:00'}`;
      const cmp = ta.localeCompare(tb);
      return departureSort === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data?.departuresList, departureSort]);

  async function downloadMealForecast() {
    setMealBusy(true);
    setMealError('');
    try {
      const res = await exportsApi.mealForecast({
        from: mealFrom,
        to: mealTo,
        format: mealFormat,
      });
      const contentType = String(res.headers['content-type'] ?? '');
      if (contentType.includes('application/json')) {
        const text = await (res.data as Blob).text();
        const parsed = JSON.parse(text) as { message?: string | string[] };
        const msg = Array.isArray(parsed.message)
          ? parsed.message.join(', ')
          : parsed.message;
        throw new Error(msg || t('dashboard.mealExportError'));
      }
      const ext = mealFormat === 'pdf' ? 'pdf' : 'xlsx';
      downloadBlob(res.data, `meal-forecast_${mealFrom}_${mealTo}.${ext}`);
      setMealOpen(false);
    } catch (err) {
      // Nest validation errors come as JSON blob when responseType=blob.
      if (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: Blob } }).response?.data instanceof Blob
      ) {
        try {
          const text = await (
            err as { response: { data: Blob } }
          ).response.data.text();
          const parsed = JSON.parse(text) as { message?: string | string[] };
          const msg = Array.isArray(parsed.message)
            ? parsed.message.join(', ')
            : parsed.message;
          setMealError(msg || t('dashboard.mealExportError'));
          return;
        } catch {
          /* fall through */
        }
      }
      setMealError(getErrorMessage(err) || t('dashboard.mealExportError'));
    } finally {
      setMealBusy(false);
    }
  }

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
        ...(data.revenueByMethod
          ? [
              {
                label: t('dashboard.revenueCash'),
                value: formatMoney(data.revenueByMethod.cash),
              },
              {
                label: t('dashboard.revenueCard'),
                value: formatMoney(data.revenueByMethod.card),
              },
              {
                label: t('dashboard.revenueTransfer'),
                value: formatMoney(data.revenueByMethod.transfer),
              },
              {
                label: t('dashboard.revenueTerminal'),
                value: formatMoney(data.revenueByMethod.terminal),
              },
              {
                label: t('dashboard.revenueOnline'),
                value: formatMoney(data.revenueByMethod.online),
              },
            ]
          : []),
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
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('common.from')}>
              <DateField value={from} onChange={setFrom} />
            </Field>
            <Field label={t('common.to')}>
              <DateField value={to} onChange={setTo} />
            </Field>
          </div>
        }
      />
      <div className="mb-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setMealError('');
            setMealOpen(true);
          }}
        >
          {t('dashboard.mealExport')}
        </Button>
      </div>
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
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <span className="font-medium">{t('dashboard.arrivalsToday')}</span>
            <button
              type="button"
              className="text-xs text-[var(--accent)] hover:underline"
              onClick={() =>
                setArrivalSort((s) => (s === 'asc' ? 'desc' : 'asc'))
              }
            >
              {t('dashboard.sortByTime', {
                dir:
                  arrivalSort === 'asc'
                    ? t('dashboard.sortAsc')
                    : t('dashboard.sortDesc'),
              })}
            </button>
          </div>
          <List items={arrivals} mode="arrival" />
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <span className="font-medium">{t('dashboard.departuresToday')}</span>
            <button
              type="button"
              className="text-xs text-[var(--accent)] hover:underline"
              onClick={() =>
                setDepartureSort((s) => (s === 'asc' ? 'desc' : 'asc'))
              }
            >
              {t('dashboard.sortByTime', {
                dir:
                  departureSort === 'asc'
                    ? t('dashboard.sortAsc')
                    : t('dashboard.sortDesc'),
              })}
            </button>
          </div>
          <List items={departures} mode="departure" />
        </Card>
      </div>

      {mealOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-5 shadow-lg">
            <h2 className="text-lg font-semibold">
              {t('dashboard.mealExportTitle')}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('dashboard.mealExportHint')}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t('common.from')}>
                <DateField value={mealFrom} onChange={setMealFrom} />
              </Field>
              <Field label={t('common.to')}>
                <DateField value={mealTo} onChange={setMealTo} />
              </Field>
              <Field label={t('dashboard.mealExportFormat')}>
                <Select
                  value={mealFormat}
                  onChange={(e) =>
                    setMealFormat(e.target.value as 'xlsx' | 'pdf')
                  }
                >
                  <option value="xlsx">{t('dashboard.mealExportXlsx')}</option>
                  <option value="pdf">{t('dashboard.mealExportPdf')}</option>
                </Select>
              </Field>
            </div>
            <ErrorBox message={mealError} />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={mealBusy}
                onClick={() => setMealOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={mealBusy}
                onClick={() => void downloadMealForecast()}
              >
                {mealBusy
                  ? t('dashboard.mealExportDownloading')
                  : t('dashboard.mealExportDownload')}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function List({
  items,
  mode,
}: {
  items: DashboardStats['arrivalsList'];
  mode: 'arrival' | 'departure';
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
      {items.map((item) => {
        const time =
          mode === 'arrival'
            ? item.checkInTime || DEFAULT_CHECK_IN_TIME
            : item.checkOutTime || DEFAULT_CHECK_OUT_TIME;
        return (
          <li key={item.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-stone-800">
                  {time}
                </span>
                <Link
                  to={`/bookings/${item.id}`}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  {item.publicCode}
                </Link>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-1 text-sm">
              {item.customerName} · {item.phone}
            </div>
            <div className="text-xs text-[var(--muted)]">
              {item.rooms.join(', ')}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
