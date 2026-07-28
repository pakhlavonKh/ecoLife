import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  availabilityApi,
  bookingsApi,
  roomLocksApi,
} from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { AvailableRoom, Booking, RoomLock } from '../api/types';
import { DateField } from '../components/DateField';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  PaymentBadge,
  Select,
  StatusBadge,
  TextArea,
} from '../components/ui';
import {
  calcBedTotal,
  calcDeposit,
  formatDate,
  formatDateTime,
  formatMoney,
  nightsBetween,
} from '../lib/format';
import { formatGuestName, splitGuestName } from '../lib/guest-name';
import { sourceLabel, statusActionLabel } from '../lib/labels';

function liveRemaining(totalStr: string, paidStr: string): number {
  const total = Number(totalStr);
  const paid = Number(paidStr);
  if (!Number.isFinite(total) || !Number.isFinite(paid)) return NaN;
  return Math.max(0, total - paid);
}

export function BookingDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [depositByCategory, setDepositByCategory] = useState<
    Record<string, number>
  >({});
  const [cashAmount, setCashAmount] = useState('');
  const [locks, setLocks] = useState<RoomLock[]>([]);
  const [lockReason, setLockReason] = useState('');
  /** Snapshot of guests|checkIn|checkOut|roomId from last load — used to skip price sync until user edits inventory. */
  const inventoryBaseline = useRef('');
  /** Shown when a bargained total was wiped by guests/dates/room change. */
  const [priceResetNotice, setPriceResetNotice] = useState<{
    from: string;
    to: string;
  } | null>(null);

  const [form, setForm] = useState({
    guestName: '',
    phone: '',
    checkIn: '',
    checkOut: '',
    roomId: '',
    guests: 1,
    notes: '',
    totalAmount: '',
  });

  async function load() {
    const { data } = await bookingsApi.get(id);
    const roomId = data.rooms[0]?.roomId ?? '';
    const guests = data.rooms[0]?.bedsBooked ?? data.bedsTotal;
    inventoryBaseline.current = `${guests}|${data.checkIn}|${data.checkOut}|${roomId}`;
    setPriceResetNotice(null);
    setBooking(data);
    setForm({
      guestName: formatGuestName(
        data.customer.firstName,
        data.customer.lastName,
      ),
      phone: data.customer.phone,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      roomId,
      guests,
      notes: data.notes ?? '',
      totalAmount: data.totalAmount,
    });
    setCashAmount(data.remainingAmount);
  }

  async function loadLocks(roomId?: string) {
    if (!roomId) {
      setLocks([]);
      return;
    }
    const { data } = await roomLocksApi.list({ roomId });
    setLocks(data);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
        if (!cancelled) setError('');
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const roomId = booking?.rooms[0]?.roomId;
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      try {
        await loadLocks(roomId);
      } catch {
        if (!cancelled) setLocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking?.rooms[0]?.roomId, booking?.id]);

  useEffect(() => {
    if (!form.checkIn || !form.checkOut) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await availabilityApi.admin(
          form.checkIn,
          form.checkOut,
          { excludeBookingId: id || undefined },
        );
        const deposits: Record<string, number> = {};
        for (const c of data.categories) {
          deposits[c.code] = c.depositPercent;
        }
        const list = data.categories.flatMap((c) => c.availableRooms ?? []);
        if (!cancelled) {
          setDepositByCategory(deposits);
          const current = booking?.rooms[0];
          if (
            current &&
            !list.some((r) => r.id === current.roomId)
          ) {
            list.unshift({
              id: current.roomId,
              number: current.number,
              capacity: current.capacity,
              remainingBeds: current.capacity,
              categoryCode: current.categoryCode,
              cottageId: current.cottageId ?? '',
              cottageName: current.cottageName,
              pricePerNight: '0',
            });
          }
          setRooms(list);
        }
      } catch {
        /* availability validation may fail for past stays — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.checkIn, form.checkOut, booking, id]);

  const selected = rooms.find((r) => r.id === form.roomId);
  const nights = nightsBetween(form.checkIn, form.checkOut);

  const calculated = useMemo(() => {
    if (!selected || nights < 1 || form.guests < 1) return null;
    const price = Number(selected.pricePerNight);
    if (!Number.isFinite(price) || price <= 0) return null;
    const total = calcBedTotal(selected.pricePerNight, form.guests, nights);
    const depositPercent = depositByCategory[selected.categoryCode] ?? 0;
    const deposit = calcDeposit(total, depositPercent);
    return { total, deposit, depositPercent, pricePerBed: selected.pricePerNight };
  }, [selected, nights, form.guests, depositByCategory]);

  // On guests / dates / room change: always reset bargained total to per-bed auto-calc.
  useEffect(() => {
    if (!calculated) return;
    const key = `${form.guests}|${form.checkIn}|${form.checkOut}|${form.roomId}`;
    if (key === inventoryBaseline.current) return;
    const next = String(calculated.total);
    const prev = form.totalAmount;
    if (prev === next || Number(prev) === Number(next)) return;
    setPriceResetNotice({ from: prev, to: next });
    setForm((f) => ({ ...f, totalAmount: next }));
  }, [form.guests, form.checkIn, form.checkOut, form.roomId, calculated?.total]);

  const previewRemaining = useMemo(() => {
    if (!booking) return null;
    const rem = liveRemaining(form.totalAmount, booking.paidAmount);
    if (!Number.isFinite(rem)) return null;
    return rem;
  }, [booking, form.totalAmount]);

  const roomAlreadyLocked = useMemo(() => {
    if (!form.roomId || !form.checkIn || !form.checkOut) return false;
    return locks.some(
      (l) =>
        l.roomId === form.roomId &&
        l.checkIn < form.checkOut &&
        l.checkOut > form.checkIn,
    );
  }, [locks, form.roomId, form.checkIn, form.checkOut]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const { firstName, lastName } = splitGuestName(form.guestName);
      const { data } = await bookingsApi.update(id, {
        firstName,
        lastName,
        phone: form.phone,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        roomId: form.roomId,
        guests: form.guests,
        notes: form.notes,
        totalAmount: form.totalAmount,
      });
      setBooking(data);
      setForm((f) => ({ ...f, totalAmount: data.totalAmount }));
      setCashAmount(data.remainingAmount);
      setMessage(t('common.saved'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onTransition(status: string) {
    if (status === 'cancelled' && !confirm(t('bookingDetail.confirmCancel'))) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await bookingsApi.transition(id, status);
      setBooking(data);
      setMessage(
        t('bookingDetail.statusChanged', {
          action: statusActionLabel(status),
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCash() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await bookingsApi.cash(id, cashAmount || undefined);
      await load();
      setMessage(t('bookingDetail.cashRecorded'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCloseRoom() {
    if (!form.roomId) return;
    if (!confirm(t('bookingDetail.confirmCloseRoom'))) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await roomLocksApi.create({
        roomId: form.roomId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        bookingId: id,
        reason:
          lockReason.trim() ||
          t('bookingDetail.closeRoomDefaultReason', {
            code: booking?.publicCode ?? id,
          }),
      });
      await loadLocks(form.roomId);
      setLockReason('');
      setMessage(t('bookingDetail.roomClosed'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!booking && !error) {
    return <div className="text-[var(--muted)]">{t('common.loading')}</div>;
  }

  const depositPaid =
    booking != null &&
    Number(booking.paidAmount) > 0 &&
    Number(booking.paidAmount) >= Number(booking.depositAmount);

  const debt = booking ? Number(booking.remainingAmount) : 0;
  const checkOutBlockedByDebt =
    debt > 0 &&
    (booking?.allowedTransitions ?? []).includes('checked_out');

  const relevantLocks = locks.filter(
    (l) =>
      !form.checkIn ||
      !form.checkOut ||
      (l.checkIn < form.checkOut && l.checkOut > form.checkIn),
  );

  return (
    <div>
      <PageHeader
        title={booking?.publicCode ?? t('bookingDetail.fallbackTitle')}
        subtitle={
          booking
            ? t('bookingDetail.createdSubtitle', {
                datetime: formatDateTime(booking.createdAt),
                source: sourceLabel(booking.source),
              })
            : undefined
        }
        actions={
          <Link to="/bookings">
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

      {booking ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          <PaymentBadge status={booking.paymentStatus} />
          <span
            className={
              booking.source === 'online_request'
                ? 'rounded-md bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-800 ring-1 ring-amber-200'
                : 'text-sm text-[var(--muted)]'
            }
          >
            {sourceLabel(booking.source)}
          </span>
          <span className="text-sm text-[var(--muted)]">
            {t('bookingDetail.amountsSummary', {
              total: formatMoney(booking.totalAmount),
              deposit: formatMoney(booking.depositAmount),
              paid: formatMoney(booking.paidAmount),
              remaining: formatMoney(booking.remainingAmount),
            })}
          </span>
        </div>
      ) : null}

      {booking?.source === 'online_request' &&
      booking.status === 'pending_payment' ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Trans
            i18nKey="bookingDetail.onlineRequestWarning"
            values={{ phone: booking.customer.phone }}
            components={{
              phoneLink: (
                <a
                  className="font-medium underline"
                  href={`tel:${booking.customer.phone}`}
                />
              ),
            }}
          />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card className="p-4">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSave}>
            <Field label={t('common.guest')}>
              <Input
                value={form.guestName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guestName: e.target.value }))
                }
                placeholder={t('common.guestNamePlaceholder')}
                required
              />
            </Field>
            <Field label={t('common.phone')}>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                required
              />
            </Field>
            <Field label={t('common.guestsCount')}>
              <Input
                type="number"
                min={1}
                value={form.guests}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guests: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label={t('common.checkIn')}>
              <DateField
                value={form.checkIn}
                onChange={(checkIn) => setForm((f) => ({ ...f, checkIn }))}
                required
              />
            </Field>
            <Field label={t('common.checkOut')}>
              <DateField
                value={form.checkOut}
                min={form.checkIn || undefined}
                onChange={(checkOut) => setForm((f) => ({ ...f, checkOut }))}
                required
              />
            </Field>
            <Field label={t('common.room')}>
              <Select
                value={form.roomId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, roomId: e.target.value }))
                }
                required
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t('bookingDetail.roomOption', {
                      number: r.number,
                      cottage: r.cottageName,
                      remaining: r.remainingBeds,
                      capacity: r.capacity,
                      category: r.categoryCode,
                    })}
                  </option>
                ))}
              </Select>
            </Field>

            {calculated ? (
              <div className="sm:col-span-2 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
                {t('bookingDetail.livePrice', {
                  price: formatMoney(calculated.pricePerBed),
                  guests: form.guests,
                  nights,
                  total: formatMoney(calculated.total),
                  percent: calculated.depositPercent,
                  deposit: formatMoney(calculated.deposit),
                })}
              </div>
            ) : null}

            {priceResetNotice ? (
              <div className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {t('bookingDetail.priceResetNotice', {
                  from: formatMoney(priceResetNotice.from),
                  to: formatMoney(priceResetNotice.to),
                })}
              </div>
            ) : null}

            {booking ? (
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2 rounded-md border border-stone-200 bg-stone-50 p-3">
                <Field label={t('bookingDetail.priceOriginalLabel')}>
                  <Input
                    value={formatMoney(booking.priceOriginal)}
                    readOnly
                    disabled
                  />
                </Field>
                <Field label={t('bookingDetail.totalAmountLabel')}>
                  <Input
                    value={form.totalAmount}
                    onChange={(e) => {
                      setPriceResetNotice(null);
                      setForm((f) => ({ ...f, totalAmount: e.target.value }));
                    }}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <div className="sm:col-span-2 text-sm text-[var(--muted)]">
                  {t(
                    depositPaid
                      ? 'bookingDetail.totalAmountHint'
                      : 'bookingDetail.totalAmountHintUnpaid',
                    {
                      deposit: formatMoney(booking.depositAmount),
                      remaining:
                        previewRemaining == null
                          ? formatMoney(booking.remainingAmount)
                          : formatMoney(previewRemaining),
                    },
                  )}
                </div>
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <Field label={t('common.notes')}>
                <TextArea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {t('bookingDetail.saveChanges')}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">
              {t('bookingDetail.actionsTitle')}
            </div>
            {checkOutBlockedByDebt ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {t('bookingDetail.checkOutDebtNotice', {
                  amount: formatMoney(booking?.remainingAmount),
                })}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              {(booking?.allowedTransitions ?? []).map((s) => {
                const blocked = s === 'checked_out' && checkOutBlockedByDebt;
                return (
                  <Button
                    key={s}
                    variant={s === 'cancelled' ? 'danger' : 'secondary'}
                    disabled={busy || blocked}
                    title={
                      blocked
                        ? t('bookingDetail.checkOutDebtNotice', {
                            amount: formatMoney(booking?.remainingAmount),
                          })
                        : undefined
                    }
                    onClick={() => void onTransition(s)}
                  >
                    {blocked
                      ? t('bookingDetail.checkOutWithDebt', {
                          action: statusActionLabel(s),
                          amount: formatMoney(booking?.remainingAmount),
                        })
                      : statusActionLabel(s)}
                  </Button>
                );
              })}
              {(booking?.allowedTransitions ?? []).length === 0 ? (
                <div className="text-sm text-[var(--muted)]">
                  {t('bookingDetail.noTransitions')}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">
              {t('bookingDetail.closeRoomTitle')}
            </div>
            <p className="mb-2 text-xs text-[var(--muted)]">
              {t('bookingDetail.closeRoomHint')}
            </p>
            {relevantLocks.length > 0 ? (
              <ul className="mb-3 space-y-1 text-xs">
                {relevantLocks.map((l) => (
                  <li
                    key={l.id}
                    className="rounded border border-stone-200 bg-stone-50 px-2 py-1"
                  >
                    {t('bookingDetail.lockLine', {
                      room: l.roomNumber,
                      checkIn: formatDate(l.checkIn),
                      checkOut: formatDate(l.checkOut),
                      reason: l.reason ?? t('common.emDash'),
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-xs text-[var(--muted)]">
                {t('bookingDetail.noLocks')}
              </p>
            )}
            <Field label={t('bookingDetail.lockReasonLabel')}>
              <Input
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder={t('bookingDetail.lockReasonPlaceholder')}
              />
            </Field>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              disabled={busy || !form.roomId || roomAlreadyLocked}
              onClick={() => void onCloseRoom()}
            >
              {roomAlreadyLocked
                ? t('bookingDetail.alreadyLocked')
                : t('bookingDetail.closeRoomAction')}
            </Button>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">
              {t('bookingDetail.cashTitle')}
            </div>
            <Field label={t('bookingDetail.cashAmountLabel')}>
              <Input
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder={
                  previewRemaining != null
                    ? String(previewRemaining)
                    : booking?.remainingAmount
                }
              />
            </Field>
            <Button
              className="mt-3 w-full"
              disabled={busy || booking?.paymentStatus === 'paid_full'}
              onClick={() => void onCash()}
            >
              {t('bookingDetail.markCashPaid')}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
