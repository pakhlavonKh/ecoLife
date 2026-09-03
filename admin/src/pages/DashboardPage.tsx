import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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

  // Meal forecast states (today is default)
  const [mealOpen, setMealOpen] = useState(false);
  const [mealMode, setMealMode] = useState<'daily' | 'range'>('daily');
  const [mealDailyDate, setMealDailyDate] = useState(todayIso);
  const [mealFrom, setMealFrom] = useState(todayIso);
  const [mealTo, setMealTo] = useState(todayIso);
  const [mealFormat, setMealFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [mealBusy, setMealBusy] = useState(false);
  const [mealError, setMealError] = useState('');

  const targetMealFrom = mealMode === 'daily' ? mealDailyDate : mealFrom;
  const targetMealTo = mealMode === 'daily' ? mealDailyDate : mealTo;

  async function downloadMealForecast() {
    setMealBusy(true);
    setMealError('');
    try {
      const res = await exportsApi.mealForecast({
        from: targetMealFrom,
        to: targetMealTo,
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
      downloadBlob(res.data, `meal-forecast_${targetMealFrom}_${targetMealTo}.${ext}`);
      setMealOpen(false);
    } catch (err) {
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

  const { pendingArrivals, completedArrivals } = useMemo(() => {
    const pending: typeof arrivals = [];
    const completed: typeof arrivals = [];
    for (const a of arrivals) {
      if (a.status === 'checked_in') {
        completed.push(a);
      } else {
        pending.push(a);
      }
    }
    return { pendingArrivals: pending, completedArrivals: completed };
  }, [arrivals]);

  const { pendingDepartures, completedDepartures } = useMemo(() => {
    const pending: typeof departures = [];
    const completed: typeof departures = [];
    for (const d of departures) {
      if (d.status === 'checked_out') {
        completed.push(d);
      } else {
        pending.push(d);
      }
    }
    return { pendingDepartures: pending, completedDepartures: completed };
  }, [departures]);

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
            const today = todayIso();
            setMealDailyDate(today);
            setMealFrom(today);
            setMealTo(today);
            setMealMode('daily');
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

      <div className="mt-6 flex flex-col gap-6">
        {/* Arrivals Today Card (Left: Pending, Right: Completed) */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base text-[var(--ink)]">
                {t('dashboard.arrivalsToday')}
              </span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
                {arrivals.length}
              </span>
            </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--line)]">
            {/* Left: Should check in */}
            <div className="flex flex-col min-h-[140px]">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-amber-50/50 px-3.5 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                  {t('dashboard.pendingArrivals')}
                </span>
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-900">
                  {pendingArrivals.length}
                </span>
              </div>
              <List items={pendingArrivals} mode="arrival" />
            </div>

            {/* Right: Already checked in */}
            <div className="flex flex-col min-h-[140px]">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-emerald-50/50 px-3.5 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-900">
                  {t('dashboard.completedArrivals')}
                </span>
                <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-xs font-bold text-emerald-900">
                  {completedArrivals.length}
                </span>
              </div>
              <List items={completedArrivals} mode="arrival" />
            </div>
          </div>
        </Card>

        {/* Departures Today Card (Left: Pending, Right: Completed) */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base text-[var(--ink)]">
                {t('dashboard.departuresToday')}
              </span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
                {departures.length}
              </span>
            </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--line)]">
            {/* Left: Should check out */}
            <div className="flex flex-col min-h-[140px]">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-amber-50/50 px-3.5 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                  {t('dashboard.pendingDepartures')}
                </span>
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-900">
                  {pendingDepartures.length}
                </span>
              </div>
              <List items={pendingDepartures} mode="departure" />
            </div>

            {/* Right: Already checked out */}
            <div className="flex flex-col min-h-[140px]">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-slate-100/70 px-3.5 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-800">
                  {t('dashboard.completedDepartures')}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">
                  {completedDepartures.length}
                </span>
              </div>
              <List items={completedDepartures} mode="departure" />
            </div>
          </div>
        </Card>
      </div>

      {mealOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <Card className="w-full max-w-md p-5 shadow-xl flex flex-col my-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ink)]">
                  {t('dashboard.mealExportTitle')}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {t('dashboard.mealExportHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMealOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--ink)] p-1 rounded hover:bg-stone-100 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Mode Switcher */}
              <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMealMode('daily')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    mealMode === 'daily'
                      ? 'bg-white shadow-sm text-[var(--ink)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {t('dashboard.mealModeDaily')}
                </button>
                <button
                  type="button"
                  onClick={() => setMealMode('range')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    mealMode === 'range'
                      ? 'bg-white shadow-sm text-[var(--ink)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {t('dashboard.mealModeRange')}
                </button>
              </div>

              {/* Date Filters */}
              {mealMode === 'daily' ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-48">
                    <Field label={t('dashboard.mealDate')}>
                      <DateField value={mealDailyDate} onChange={setMealDailyDate} />
                    </Field>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setMealDailyDate(todayIso())}
                    className="mb-0.5 text-xs py-1 px-2"
                  >
                    {t('dashboard.todaySubtitle', { date: '' }).trim() || 'Сегодня'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('common.from')}>
                      <DateField value={mealFrom} onChange={setMealFrom} />
                    </Field>
                    <Field label={t('common.to')}>
                      <DateField value={mealTo} onChange={setMealTo} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                    <button
                      type="button"
                      onClick={() => {
                        const today = todayIso();
                        setMealFrom(today);
                        setMealTo(today);
                      }}
                      className="px-2 py-0.5 rounded border border-[var(--line)] bg-white hover:bg-stone-50 text-[var(--ink)]"
                    >
                      {t('dashboard.mealModeDaily')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d2 = new Date();
                        d2.setDate(d2.getDate() + 2);
                        setMealFrom(todayIso());
                        setMealTo(`${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`);
                      }}
                      className="px-2 py-0.5 rounded border border-[var(--line)] bg-white hover:bg-stone-50 text-[var(--ink)]"
                    >
                      3 дня
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d2 = new Date();
                        d2.setDate(d2.getDate() + 6);
                        setMealFrom(todayIso());
                        setMealTo(`${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`);
                      }}
                      className="px-2 py-0.5 rounded border border-[var(--line)] bg-white hover:bg-stone-50 text-[var(--ink)]"
                    >
                      7 дней
                    </button>
                  </div>
                </div>
              )}

              {/* Format */}
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

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
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
              <ErrorBox message={mealError} />
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
  const navigate = useNavigate();
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
          <li
            key={item.id}
            onClick={() => navigate(`/bookings/${item.id}`)}
            className="cursor-pointer px-4 py-3 hover:bg-[var(--bg)]/60"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-stone-800">
                  {time}
                </span>
                <span className="font-medium text-[var(--accent)] hover:underline">
                  {item.publicCode}
                </span>
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
