import dayjs from 'dayjs';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
import {
  addDaysIso,
  addMinutesToTime,
  dayOverlapsInterval,
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  formatDate,
  todayIso,
} from '../lib/format';
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

const BUFFER_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(-45deg, #a8a29e 0 2px, transparent 2px 5px)',
  backgroundColor: '#e7e5e4',
  color: '#57534e',
};

function stayTimes(item: {
  checkInTime?: string;
  checkOutTime?: string;
}): { inTime: string; outTime: string } {
  return {
    inTime: item.checkInTime || DEFAULT_CHECK_IN_TIME,
    outTime: item.checkOutTime || DEFAULT_CHECK_OUT_TIME,
  };
}

function occupiesStayDay(
  checkIn: string,
  checkOut: string,
  checkInTime: string,
  checkOutTime: string,
  day: string,
): boolean {
  return dayOverlapsInterval(day, checkIn, checkInTime, checkOut, checkOutTime);
}

/** Cleaning buffer [checkOut, checkOut+buffer) overlaps the day column. */
function occupiesBufferDay(
  checkOut: string,
  checkOutTime: string,
  bufferMinutes: number,
  day: string,
): boolean {
  if (bufferMinutes <= 0) return false;
  const { dateOffset, time: endTime } = addMinutesToTime(
    checkOutTime,
    bufferMinutes,
  );
  const endDate = dayjs(checkOut.slice(0, 10))
    .add(dateOffset, 'day')
    .format('YYYY-MM-DD');
  return dayOverlapsInterval(day, checkOut, checkOutTime, endDate, endTime);
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

  const bufferMinutes = data?.cleaningBufferMinutes ?? 60;

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
        let n = 0;
        for (const b of data.bookings ?? []) {
          if (b.roomId !== room.id) continue;
          const { inTime, outTime } = stayTimes(b);
          if (occupiesStayDay(b.checkIn, b.checkOut, inTime, outTime, day)) {
            n += 1;
          } else if (
            !b.skipCleaningBuffer &&
            occupiesBufferDay(b.checkOut, outTime, bufferMinutes, day)
          ) {
            n += 1;
          }
        }
        if (
          (data.locks ?? []).some((l) => {
            if (l.roomId !== room.id) return false;
            const { inTime, outTime } = stayTimes(l);
            return occupiesStayDay(l.checkIn, l.checkOut, inTime, outTime, day);
          })
        ) {
          n += 1;
        }
        if (n > maxSegments) maxSegments = n;
      }
    }
    return Math.max(56, 18 + maxSegments * 18 + 16);
  }, [data, days, bufferMinutes]);

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
              className="inline-block h-2.5 w-4 rounded-sm border border-stone-400"
              style={BUFFER_STYLE}
            />
            {t('calendar.legendBuffer')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-amber-400" />
            {t('calendar.legendTransferClean')}
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
                  const dayBookings = roomBookings.filter((b) => {
                    const { inTime, outTime } = stayTimes(b);
                    return occupiesStayDay(
                      b.checkIn,
                      b.checkOut,
                      inTime,
                      outTime,
                      day,
                    );
                  });
                  const bufferOnly = roomBookings.filter((b) => {
                    if (b.skipCleaningBuffer) return false;
                    const { inTime, outTime } = stayTimes(b);
                    if (
                      occupiesStayDay(
                        b.checkIn,
                        b.checkOut,
                        inTime,
                        outTime,
                        day,
                      )
                    ) {
                      return false;
                    }
                    return occupiesBufferDay(
                      b.checkOut,
                      outTime,
                      bufferMinutes,
                      day,
                    );
                  });
                  const cleaningNotice = roomBookings.filter((b) => {
                    if (!b.skipCleaningBuffer) return false;
                    // Marker on the checkout day only (no buffer tail).
                    return b.checkOut.slice(0, 10) === day;
                  });
                  const dayLocks = roomLocks.filter((l) => {
                    const { inTime, outTime } = stayTimes(l);
                    return occupiesStayDay(
                      l.checkIn,
                      l.checkOut,
                      inTime,
                      outTime,
                      day,
                    );
                  });
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
                        ? dayLocks.map((lock) => {
                            const { inTime, outTime } = stayTimes(lock);
                            return (
                              <div
                                key={lock.id}
                                className="w-full truncate rounded px-0.5 text-center text-[9px] font-medium leading-4 text-white"
                                style={{ background: LOCK_COLOR }}
                                title={t('calendar.lockTitle', {
                                  checkIn: `${formatDate(lock.checkIn)} ${inTime}`,
                                  checkOut: `${formatDate(lock.checkOut)} ${outTime}`,
                                  reason: lock.reason ?? t('common.emDash'),
                                })}
                              >
                                {t('calendar.lockLabel')}
                              </div>
                            );
                          })
                        : null}

                      {dayBookings.map((bar) => {
                        const { inTime, outTime } = stayTimes(bar);
                        const showBufferTail =
                          !bar.skipCleaningBuffer &&
                          bufferMinutes > 0 &&
                          occupiesBufferDay(
                            bar.checkOut,
                            outTime,
                            bufferMinutes,
                            day,
                          );
                        const showCleaningNotice =
                          Boolean(bar.skipCleaningBuffer) &&
                          bar.checkOut.slice(0, 10) === day;
                        return (
                          <div
                            key={`${bar.bookingId}-${bar.segmentIndex ?? 0}-${day}`}
                            className="flex w-full items-stretch gap-px"
                          >
                            <Link
                              to={`/bookings/${bar.bookingId}`}
                              className={`block min-w-0 flex-1 truncate rounded-l px-0.5 text-center text-[9px] font-medium leading-4 text-white shadow-sm ${
                                showBufferTail || showCleaningNotice
                                  ? ''
                                  : 'rounded-r'
                              }`}
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
                                checkIn: `${formatDate(bar.checkIn)} ${inTime}`,
                                checkOut: `${formatDate(bar.checkOut)} ${outTime}`,
                                status: statusLabel(bar.status),
                              })}
                            >
                              {t('calendar.segmentLabel', {
                                roomNumber: bar.roomNumber,
                                beds: bar.bedsBooked,
                                capacity: room.capacity,
                                checkInTime: inTime,
                                checkOutTime: outTime,
                              })}
                            </Link>
                            {showCleaningNotice ? (
                              <span
                                className="w-2 shrink-0 rounded-r bg-amber-400"
                                title={t('calendar.transferCleanTitle', {
                                  from: outTime,
                                  room: bar.roomNumber,
                                })}
                              />
                            ) : null}
                            {showBufferTail ? (
                              <span
                                className="w-2 shrink-0 rounded-r"
                                style={BUFFER_STYLE}
                                title={t('calendar.bufferTitle', {
                                  from: outTime,
                                  minutes: bufferMinutes,
                                })}
                              />
                            ) : null}
                          </div>
                        );
                      })}

                      {cleaningNotice
                        .filter(
                          (b) =>
                            !dayBookings.some(
                              (d) =>
                                d.bookingId === b.bookingId &&
                                (d.segmentIndex ?? 0) === (b.segmentIndex ?? 0),
                            ),
                        )
                        .map((bar) => {
                          const { outTime } = stayTimes(bar);
                          return (
                            <Link
                              key={`xfer-${bar.bookingId}-${bar.segmentIndex ?? 0}-${day}`}
                              to={`/bookings/${bar.bookingId}`}
                              className="block w-full truncate rounded px-0.5 text-center text-[8px] font-medium leading-4 text-amber-950 shadow-sm"
                              style={{ background: '#fbbf24' }}
                              title={t('calendar.transferCleanTitle', {
                                from: outTime,
                                room: bar.roomNumber,
                              })}
                            >
                              {t('calendar.transferCleanLabel')}
                            </Link>
                          );
                        })}

                      {bufferOnly.map((bar) => {
                        const { outTime } = stayTimes(bar);
                        return (
                          <Link
                            key={`buf-${bar.bookingId}-${bar.segmentIndex ?? 0}-${day}`}
                            to={`/bookings/${bar.bookingId}`}
                            className="block w-full truncate rounded px-0.5 text-center text-[8px] font-medium leading-4 shadow-sm"
                            style={BUFFER_STYLE}
                            title={t('calendar.bufferTitle', {
                              from: outTime,
                              minutes: bufferMinutes,
                            })}
                          >
                            {t('calendar.bufferLabel')}
                          </Link>
                        );
                      })}

                      {(occupied > 0 ||
                        locked ||
                        bufferOnly.length > 0 ||
                        cleaningNotice.length > 0) && (
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
