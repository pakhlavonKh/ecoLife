import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calendarApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { CalendarData } from '../api/types';
import { DateField } from '../components/DateField';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  PageHeader,
} from '../components/ui';
import { addDaysIso, formatDate, todayIso } from '../lib/format';
import { statusLabel } from '../lib/labels';

const STATUS_COLOR: Record<string, string> = {
  pending_payment: '#d97706',
  deposit_paid: '#2563eb',
  confirmed: '#2f6b3a',
  checked_in: '#0f766e',
  checked_out: '#64748b',
  cancelled: '#b42318',
};

export function CalendarPage() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDaysIso(14));
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await calendarApi.get(from, to);
        if (!cancelled) {
          setData(res.data);
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

  const days = useMemo(() => {
    if (!data) return [] as string[];
    const list: string[] = [];
    let cur = dayjs(data.from);
    const end = dayjs(data.to);
    while (cur.isBefore(end, 'day')) {
      list.push(cur.format('YYYY-MM-DD'));
      cur = cur.add(1, 'day');
    }
    return list;
  }, [data]);

  const dayWidth = 36;

  return (
    <div>
      <PageHeader
        title="Шахматка"
        subtitle="Сетка номера × дни с полосами броней"
        actions={
          <Link to="/bookings/new">
            <Button>Новая бронь</Button>
          </Link>
        }
      />
      <Card className="mb-4 flex flex-wrap gap-3 p-4">
        <Field label="С">
          <DateField value={from} onChange={setFrom} />
        </Field>
        <Field label="По (не включительно)">
          <DateField value={to} onChange={setTo} min={from || undefined} />
        </Field>
      </Card>
      <ErrorBox message={error} />

      <Card className="overflow-auto">
        <div
          className="min-w-max"
          style={{
            ['--day-w' as string]: `${dayWidth}px`,
          }}
        >
          <div
            className="sticky top-0 z-10 grid border-b border-[var(--line)] bg-[var(--surface)]"
            style={{
              gridTemplateColumns: `160px repeat(${days.length}, ${dayWidth}px)`,
            }}
          >
            <div className="px-3 py-2 text-xs font-medium text-[var(--muted)]">
              Номер
            </div>
            {days.map((d) => (
              <div
                key={d}
                className="border-l border-[var(--line)] px-0.5 py-2 text-center text-[10px] text-[var(--muted)]"
              >
                <div>{dayjs(d).format('DD')}</div>
                <div>{dayjs(d).format('dd')}</div>
              </div>
            ))}
          </div>

          {(data?.rooms ?? []).map((room) => {
            const bars = (data?.bookings ?? []).filter(
              (b) => b.roomId === room.id,
            );
            return (
              <div
                key={room.id}
                className="relative grid border-b border-[var(--line)]"
                style={{
                  gridTemplateColumns: `160px repeat(${days.length}, ${dayWidth}px)`,
                  minHeight: 44,
                }}
              >
                <div className="flex flex-col justify-center px-3 py-2 text-sm">
                  <div className="font-medium">{room.number}</div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {room.cottageName} · {room.categoryCode}
                  </div>
                </div>
                {days.map((d) => (
                  <div
                    key={d}
                    className="border-l border-[var(--line)] bg-white"
                  />
                ))}
                <div
                  className="pointer-events-none absolute inset-y-1"
                  style={{ left: 160, right: 0 }}
                >
                  {bars.map((bar) => {
                    const start = Math.max(
                      0,
                      dayjs(bar.checkIn).diff(dayjs(from), 'day'),
                    );
                    const endExclusive = Math.min(
                      days.length,
                      dayjs(bar.checkOut).diff(dayjs(from), 'day'),
                    );
                    const span = endExclusive - start;
                    if (span <= 0) return null;
                    return (
                      <Link
                        key={`${bar.bookingId}-${bar.roomId}`}
                        to={`/bookings/${bar.bookingId}`}
                        className="pointer-events-auto absolute top-1 bottom-1 flex items-center overflow-hidden rounded px-1 text-[10px] font-medium text-white shadow-sm"
                        style={{
                          left: start * dayWidth + 2,
                          width: span * dayWidth - 4,
                          background:
                            STATUS_COLOR[bar.status] ?? STATUS_COLOR.confirmed,
                        }}
                        title={`${bar.publicCode} · ${bar.customerName} · ${formatDate(bar.checkIn)}–${formatDate(bar.checkOut)} · ${statusLabel(bar.status)}`}
                      >
                        <span className="truncate">
                          {bar.publicCode} {bar.customerName}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
