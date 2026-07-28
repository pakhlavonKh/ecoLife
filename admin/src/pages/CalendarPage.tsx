import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const LOCK_COLOR = '#78716c';
const DAY_WIDTH = 44;

function occupiesDay(
  checkIn: string,
  checkOut: string,
  day: string,
): boolean {
  return checkIn <= day && day < checkOut;
}

export function CalendarPage() {
  const { t } = useTranslation();
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

  const rowHeight = useMemo(() => {
    if (!data) return 56;
    let maxSegments = 1;
    for (const room of data.rooms) {
      for (const day of days) {
        const n =
          (data.bookings ?? []).filter(
            (b) =>
              b.roomId === room.id &&
              occupiesDay(b.checkIn, b.checkOut, day),
          ).length +
          ((data.locks ?? []).some(
            (l) =>
              l.roomId === room.id &&
              occupiesDay(l.checkIn, l.checkOut, day),
          )
            ? 1
            : 0);
        if (n > maxSegments) maxSegments = n;
      }
    }
    return Math.max(56, 18 + maxSegments * 18 + 16);
  }, [data, days]);

  return (
    <div>
      <PageHeader
        title={t('calendar.title')}
        subtitle={t('calendar.subtitle')}
        actions={
          <Link to="/bookings/new">
            <Button>{t('calendar.newBooking')}</Button>
          </Link>
        }
      />
      <Card className="mb-4 flex flex-wrap gap-3 p-4">
        <Field label={t('common.from')}>
          <DateField value={from} onChange={setFrom} />
        </Field>
        <Field label={t('calendar.toExclusive')}>
          <DateField value={to} onChange={setTo} min={from || undefined} />
        </Field>
        <div className="flex flex-wrap items-end gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ background: STATUS_COLOR.confirmed }}
            />
            {t('calendar.legendBooking')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ background: LOCK_COLOR }}
            />
            {t('calendar.legendLock')}
          </span>
        </div>
      </Card>
      <ErrorBox message={error} />

      <Card className="overflow-auto">
        <div className="min-w-max">
          <div
            className="sticky top-0 z-10 grid border-b border-[var(--line)] bg-[var(--surface)]"
            style={{
              gridTemplateColumns: `168px repeat(${days.length}, ${DAY_WIDTH}px)`,
            }}
          >
            <div className="px-3 py-2 text-xs font-medium text-[var(--muted)]">
              {t('calendar.colRoom')}
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
            const roomBookings = (data?.bookings ?? []).filter(
              (b) => b.roomId === room.id,
            );
            const roomLocks = (data?.locks ?? []).filter(
              (l) => l.roomId === room.id,
            );

            return (
              <div
                key={room.id}
                className="grid border-b border-[var(--line)]"
                style={{
                  gridTemplateColumns: `168px repeat(${days.length}, ${DAY_WIDTH}px)`,
                  minHeight: rowHeight,
                }}
              >
                <div className="flex flex-col justify-center px-3 py-2 text-sm">
                  <div className="font-medium">
                    {room.number}
                    <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">
                      {t('calendar.capacityLabel', {
                        capacity: room.capacity,
                      })}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {t('calendar.roomMeta', {
                      cottage: room.cottageName,
                      category: room.categoryCode,
                    })}
                  </div>
                </div>

                {days.map((day) => {
                  const dayBookings = roomBookings.filter((b) =>
                    occupiesDay(b.checkIn, b.checkOut, day),
                  );
                  const dayLocks = roomLocks.filter((l) =>
                    occupiesDay(l.checkIn, l.checkOut, day),
                  );
                  const occupied = dayBookings.reduce(
                    (sum, b) => sum + (b.bedsBooked ?? 0),
                    0,
                  );
                  const locked = dayLocks.length > 0;

                  return (
                    <div
                      key={day}
                      className="flex flex-col gap-0.5 border-l border-[var(--line)] bg-white p-0.5"
                    >
                      {locked
                        ? dayLocks.map((lock) => (
                            <div
                              key={lock.id}
                              className="w-full truncate rounded px-0.5 text-center text-[9px] font-medium leading-4 text-white"
                              style={{ background: LOCK_COLOR }}
                              title={t('calendar.lockTitle', {
                                checkIn: formatDate(lock.checkIn),
                                checkOut: formatDate(lock.checkOut),
                                reason: lock.reason ?? t('common.emDash'),
                              })}
                            >
                              {t('calendar.lockLabel')}
                            </div>
                          ))
                        : null}

                      {dayBookings.map((bar) => (
                        <Link
                          key={`${bar.bookingId}-${day}`}
                          to={`/bookings/${bar.bookingId}`}
                          className="block w-full truncate rounded px-0.5 text-center text-[9px] font-medium leading-4 text-white shadow-sm"
                          style={{
                            background:
                              STATUS_COLOR[bar.status] ??
                              STATUS_COLOR.confirmed,
                          }}
                          title={t('calendar.segmentTitle', {
                            code: bar.publicCode,
                            customerName: bar.customerName,
                            beds: bar.bedsBooked,
                            capacity: room.capacity,
                            checkIn: formatDate(bar.checkIn),
                            checkOut: formatDate(bar.checkOut),
                            status: statusLabel(bar.status),
                          })}
                        >
                          {t('calendar.segmentLabel', {
                            beds: bar.bedsBooked,
                            capacity: room.capacity,
                          })}
                        </Link>
                      ))}

                      {(occupied > 0 || locked) && (
                        <div className="mt-auto text-center text-[8px] leading-3 text-[var(--muted)]">
                          {locked
                            ? t('calendar.fullLockHint')
                            : t('calendar.occupiedHint', {
                                occupied,
                                capacity: room.capacity,
                              })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
