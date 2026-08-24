import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  auditApi,
  availabilityApi,
  bookingsApi,
  roomLocksApi,
} from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type {
  AuditEntry,
  AvailableRoom,
  Booking,
  RoomLock,
} from '../api/types';
import { DateField } from '../components/DateField';
import { ExtendBookingModal } from '../components/ExtendBookingModal';
import { TimeField } from '../components/TimeField';
import { TransferBookingModal } from '../components/TransferBookingModal';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  MoneyInput,
  PageHeader,
  PaymentBadge,
  Select,
  StatusBadge,
  TextArea,
} from '../components/ui';
import {
  calcAgeTotal,
  calcDeposit,
  cleaningBlockedUntil,
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyInput,
  unformatMoneyInput,
  nightsBetween,
  occupyingBeds,
} from '../lib/format';
import { formatGuestName, splitGuestName } from '../lib/guest-name';
import {
  paymentProviderLabel,
  sourceLabel,
  statusActionLabel,
} from '../lib/labels';

const TRANSFER_EXTEND_STATUSES = new Set([
  'pending_payment',
  'deposit_paid',
  'confirmed',
  'checked_in',
]);

function segmentLetter(index: number): string {
  return String.fromCharCode(65 + Math.min(Math.max(index, 0), 25));
}

const MANUAL_PAYMENT_METHODS = [
  'cash',
  'card',
  'transfer',
  'terminal',
] as const;

type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

function liveRemaining(totalStr: string, paidStr: string): number {
  const total = Number(totalStr);
  const paid = Number(paidStr);
  if (!Number.isFinite(total) || !Number.isFinite(paid)) return NaN;
  return Math.max(0, total - paid);
}

export function BookingDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [depositByCategory, setDepositByCategory] = useState<
    Record<string, number>
  >({});
  const [bufferMinutes, setBufferMinutes] = useState(60);
  const [cashAmount, setCashAmount] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<ManualPaymentMethod>('cash');
  const [locks, setLocks] = useState<RoomLock[]>([]);
  const [lockReason, setLockReason] = useState('');
  /** Snapshot of adults|children|infants|dates|times|roomId from last load. */
  const inventoryBaseline = useRef('');
  /** Shown when a bargained total was wiped by guests/dates/room change. */
  const [priceResetNotice, setPriceResetNotice] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const [form, setForm] = useState({
    guestName: '',
    phone: '',
    checkIn: '',
    checkOut: '',
    checkInTime: DEFAULT_CHECK_IN_TIME,
    checkOutTime: DEFAULT_CHECK_OUT_TIME,
    roomId: '',
    adults: 1,
    children: 0,
    infants: 0,
    notes: '',
    totalAmount: '',
  });

  async function load() {
    const { data } = await bookingsApi.get(id);
    const activeRooms = [...data.rooms]
      .filter((r) => r.isActive)
      .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));
    const primary = activeRooms[activeRooms.length - 1] ?? data.rooms[0];
    const roomId = primary?.roomId ?? '';
    const adults = data.adults ?? primary?.bedsBooked ?? data.bedsTotal;
    const children = data.children ?? 0;
    const infants = data.infants ?? 0;
    const checkInTime = data.checkInTime || DEFAULT_CHECK_IN_TIME;
    const checkOutTime = data.checkOutTime || DEFAULT_CHECK_OUT_TIME;
    inventoryBaseline.current = `${adults}|${children}|${infants}|${data.checkIn}|${data.checkOut}|${checkInTime}|${checkOutTime}|${roomId}`;
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
      checkInTime,
      checkOutTime,
      roomId,
      adults,
      children,
      infants,
      notes: data.notes ?? '',
      totalAmount: formatMoneyInput(data.totalAmount),
    });
    setCashAmount(formatMoneyInput(data.remainingAmount));
  }

  async function loadAudit() {
    if (!id) return;
    const { data } = await auditApi.list({
      entity: 'booking',
      entityId: id,
      limit: 20,
    });
    setAuditEntries(data);
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
        await loadAudit().catch(() => {
          if (!cancelled) setAuditEntries([]);
        });
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

  const activeSegments = useMemo(() => {
    if (!booking) return [];
    return [...booking.rooms]
      .filter((r) => r.isActive)
      .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));
  }, [booking]);

  const multiSegment = activeSegments.length > 1;

  const canTransferExtend =
    !!booking && TRANSFER_EXTEND_STATUSES.has(booking.status);

  useEffect(() => {
    const roomId =
      activeSegments[activeSegments.length - 1]?.roomId ??
      booking?.rooms[0]?.roomId;
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
  }, [
    activeSegments[activeSegments.length - 1]?.roomId,
    booking?.id,
  ]);

  useEffect(() => {
    if (!form.checkIn || !form.checkOut) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await availabilityApi.admin(
          form.checkIn,
          form.checkOut,
          {
            excludeBookingId: id || undefined,
            checkInTime: form.checkInTime,
            checkOutTime: form.checkOutTime,
          },
        );
        const deposits: Record<string, number> = {};
        for (const c of data.categories) {
          deposits[c.code] = c.depositPercent;
        }
        const list = data.categories.flatMap((c) => c.availableRooms ?? []);
        if (!cancelled) {
          setDepositByCategory(deposits);
          if (typeof data.cleaningBufferMinutes === 'number') {
            setBufferMinutes(data.cleaningBufferMinutes);
          }
          const current =
            activeSegments[activeSegments.length - 1] ?? booking?.rooms[0];
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
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setRooms([]);
          setError(getErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    form.checkIn,
    form.checkOut,
    form.checkInTime,
    form.checkOutTime,
    booking,
    id,
  ]);

  const selected = rooms.find((r) => r.id === form.roomId);
  const nights = nightsBetween(form.checkIn, form.checkOut);
  const bufferUntil = form.checkOut
    ? cleaningBlockedUntil(
        form.checkOut,
        form.checkOutTime,
        bufferMinutes,
      )
    : null;

  const calculated = useMemo(() => {
    if (!selected || nights < 1 || form.adults < 1) return null;
    const prices = {
      priceAdult: selected.priceAdult ?? selected.pricePerNight,
      priceChild: selected.priceChild ?? '0',
      priceInfant: selected.priceInfant ?? '0',
    };
    const counts = {
      adults: form.adults,
      children: form.children,
      infants: form.infants,
    };
    const total = calcAgeTotal(prices, counts, nights);
    const depositPercent = depositByCategory[selected.categoryCode] ?? 0;
    const deposit = calcDeposit(total, depositPercent);
    return {
      total,
      deposit,
      depositPercent,
      ...prices,
      ...counts,
      beds: occupyingBeds(form.adults, form.children),
    };
  }, [
    selected,
    nights,
    form.adults,
    form.children,
    form.infants,
    depositByCategory,
  ]);

  // On guests / dates / times / room change: always reset bargained total to auto-calc.
  useEffect(() => {
    if (!calculated) return;
    const key = `${form.adults}|${form.children}|${form.infants}|${form.checkIn}|${form.checkOut}|${form.checkInTime}|${form.checkOutTime}|${form.roomId}`;
    if (key === inventoryBaseline.current) return;
    const nextFormatted = formatMoneyInput(calculated.total);
    const prevRaw = unformatMoneyInput(form.totalAmount);
    if (prevRaw === String(calculated.total)) return;
    setPriceResetNotice({ from: form.totalAmount, to: nextFormatted });
    setForm((f) => ({ ...f, totalAmount: nextFormatted }));
  }, [
    form.adults,
    form.children,
    form.infants,
    form.checkIn,
    form.checkOut,
    form.checkInTime,
    form.checkOutTime,
    form.roomId,
    calculated?.total,
  ]);

  const previewRemaining = useMemo(() => {
    if (!booking) return null;
    const rem = liveRemaining(unformatMoneyInput(form.totalAmount), booking.paidAmount);
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
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        roomId: form.roomId,
        adults: form.adults,
        children: form.children,
        infants: form.infants,
        notes: form.notes,
        totalAmount: unformatMoneyInput(form.totalAmount),
      });
      setBooking(data);
      const roomId = data.rooms[0]?.roomId ?? form.roomId;
      const adults = data.adults ?? form.adults;
      const children = data.children ?? form.children;
      const infants = data.infants ?? form.infants;
      const checkInTime = data.checkInTime || form.checkInTime;
      const checkOutTime = data.checkOutTime || form.checkOutTime;
      inventoryBaseline.current = `${adults}|${children}|${infants}|${data.checkIn}|${data.checkOut}|${checkInTime}|${checkOutTime}|${roomId}`;
      setPriceResetNotice(null);
      setForm((f) => ({
        ...f,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        checkInTime,
        checkOutTime,
        adults,
        children,
        infants,
        totalAmount: formatMoneyInput(data.totalAmount),
      }));
      setCashAmount(formatMoneyInput(data.remainingAmount));
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

  async function onMarkPayment() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await bookingsApi.markPayment(
        id,
        paymentMethod,
        unformatMoneyInput(cashAmount) || undefined,
      );
      await load();
      setCashAmount('');
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
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
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

  async function onDeleteBooking() {
    if (!booking) return;
    if (!window.confirm(t('bookings.confirmDelete', { defaultValue: 'Delete this booking permanently?' }))) {
      return;
    }
    setBusy(true);
    try {
      await bookingsApi.delete(booking.id);
      navigate('/bookings');
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

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
          <div className="flex items-center gap-2">
            {booking ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={onDeleteBooking}
              >
                {t('common.delete')}
              </Button>
            ) : null}
            <Link to="/bookings">
              <Button variant="secondary">{t('common.backToList')}</Button>
            </Link>
          </div>
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

      {activeSegments.length > 0 ? (
        <Card className="mb-4 p-4">
          <div className="mb-3 text-sm font-medium">
            {t('bookingDetail.segmentsTitle')}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {activeSegments.map((seg) => {
              const letter = segmentLetter(seg.segmentIndex ?? 0);
              const nights = nightsBetween(
                seg.checkIn ?? booking!.checkIn,
                seg.checkOut ?? booking!.checkOut,
              );
              return (
                <div
                  key={seg.bookingRoomId}
                  className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
                >
                  <div className="font-medium">
                    {t('bookingDetail.segmentHeading', {
                      letter,
                      room: seg.number,
                      category: seg.categoryCode,
                    })}
                  </div>
                  <div className="mt-1 text-[var(--muted)]">
                    {t('bookingDetail.segmentDates', {
                      checkIn: `${formatDate(seg.checkIn ?? booking!.checkIn)} ${seg.checkInTime || booking!.checkInTime}`,
                      checkOut: `${formatDate(seg.checkOut ?? booking!.checkOut)} ${seg.checkOutTime || booking!.checkOutTime}`,
                      nights,
                    })}
                  </div>
                  <div className="mt-1">
                    {t('bookingDetail.segmentAmount', {
                      amount: formatMoney(seg.amount),
                      cottage: seg.cottageName,
                    })}
                  </div>
                  {seg.skipCleaningBuffer ? (
                    <div className="mt-1 text-xs text-amber-800">
                      {t('bookingDetail.segmentTransferExit')}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {booking?.priceBreakdown?.lastAdjustment ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              {t('bookingDetail.lastAdjustment', {
                operation: t(
                  `bookingDetail.operation.${booking.priceBreakdown.lastAdjustment.operation}`,
                ),
                amount: formatMoney(
                  booking.priceBreakdown.lastAdjustment.amount,
                ),
              })}
            </p>
          ) : null}
        </Card>
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
            <Field label={t('common.adults')}>
              <Input
                type="number"
                min={1}
                value={form.adults}
                onChange={(e) =>
                  setForm((f) => ({ ...f, adults: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label={t('common.children')}>
              <Input
                type="number"
                min={0}
                value={form.children}
                onChange={(e) =>
                  setForm((f) => ({ ...f, children: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label={t('common.infants')}>
              <Input
                type="number"
                min={0}
                value={form.infants}
                onChange={(e) =>
                  setForm((f) => ({ ...f, infants: Number(e.target.value) }))
                }
              />
            </Field>
            <p className="sm:col-span-2 -mt-1 text-xs text-[var(--muted)]">
              {t('common.guestAgeHint', {
                beds: occupyingBeds(form.adults, form.children),
              })}
            </p>
            <Field label={t('common.checkIn')}>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <DateField
                  value={form.checkIn}
                  onChange={(checkIn) => setForm((f) => ({ ...f, checkIn }))}
                  required
                />
                <TimeField
                  value={form.checkInTime}
                  onChange={(checkInTime) =>
                    setForm((f) => ({ ...f, checkInTime }))
                  }
                  required
                />
              </div>
            </Field>
            <Field label={t('common.checkOut')}>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <DateField
                  value={form.checkOut}
                  min={form.checkIn || undefined}
                  onChange={(checkOut) => setForm((f) => ({ ...f, checkOut }))}
                  required
                />
                <TimeField
                  value={form.checkOutTime}
                  onChange={(checkOutTime) =>
                    setForm((f) => ({ ...f, checkOutTime }))
                  }
                  required
                />
              </div>
            </Field>
            {bufferUntil && bufferMinutes > 0 ? (
              <p className="sm:col-span-2 -mt-1 text-xs text-[var(--muted)]">
                {t('bookingDetail.cleaningBufferHint', {
                  until: bufferUntil.label,
                  minutes: bufferMinutes,
                })}
              </p>
            ) : null}
            <Field label={t('common.room')}>
              <Select
                value={form.roomId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, roomId: e.target.value }))
                }
                required
                disabled={multiSegment}
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
            {multiSegment ? (
              <p className="sm:col-span-2 -mt-1 text-xs text-amber-800">
                {t('bookingDetail.multiSegmentRoomHint')}
              </p>
            ) : null}

            {calculated ? (
              <div className="sm:col-span-2 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
                {t('bookingDetail.livePrice', {
                  adults: calculated.adults,
                  priceAdult: formatMoney(calculated.priceAdult),
                  children: calculated.children,
                  priceChild: formatMoney(calculated.priceChild),
                  infants: calculated.infants,
                  priceInfant: formatMoney(calculated.priceInfant),
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
                  <MoneyInput
                    value={form.totalAmount}
                    onValueChange={(val) => {
                      setPriceResetNotice(null);
                      setForm((f) => ({ ...f, totalAmount: val }));
                    }}
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
              {canTransferExtend ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setTransferOpen(true)}
                  >
                    {t('bookingDetail.transferAction')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setExtendOpen(true)}
                  >
                    {t('bookingDetail.extendAction')}
                  </Button>
                </>
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
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('bookingDetail.cashAmountLabel')}>
                <MoneyInput
                  value={cashAmount}
                  onValueChange={(val) => setCashAmount(val)}
                  placeholder={
                    previewRemaining != null
                      ? formatMoneyInput(previewRemaining)
                      : formatMoneyInput(booking?.remainingAmount)
                  }
                />
              </Field>
              <Field label={t('bookingDetail.paymentMethodLabel')}>
                <Select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as ManualPaymentMethod)
                  }
                >
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {paymentProviderLabel(m)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button
              className="mt-3 w-full"
              disabled={busy || booking?.paymentStatus === 'paid_full'}
              onClick={() => void onMarkPayment()}
            >
              {t('bookingDetail.markCashPaid')}
            </Button>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">
              {t('bookingDetail.paymentsTitle')}
            </div>
            {(booking?.payments?.length ?? 0) > 0 ? (
              <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                {booking!.payments!.map((p) => (
                  <li key={p.id}>
                    {t('bookingDetail.paymentLine', {
                      date: formatDateTime(p.createdAt),
                      amount: formatMoney(p.amount),
                      method: paymentProviderLabel(p.provider),
                      who:
                        p.recordedByName ??
                        t('bookingDetail.paymentRecordedBySystem'),
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                {t('bookingDetail.paymentsEmpty')}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {t('bookingDetail.auditTitle')}
              </div>
              <Link
                to={`/audit?entity=booking&entityId=${id}`}
                className="text-xs text-[var(--accent)] underline"
              >
                {t('bookingDetail.auditAll')}
              </Link>
            </div>
            {auditEntries.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                {auditEntries.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    {t('bookingDetail.auditLine', {
                      date: formatDateTime(a.createdAt),
                      action: a.action,
                      actor: a.actorType,
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                {t('bookingDetail.auditEmpty')}
              </p>
            )}
          </Card>
        </div>
      </div>

      {booking ? (
        <>
          <TransferBookingModal
            booking={booking}
            open={transferOpen}
            onClose={() => setTransferOpen(false)}
            onDone={(msg) => {
              setMessage(msg);
              void load();
              void loadAudit().catch(() => setAuditEntries([]));
            }}
          />
          <ExtendBookingModal
            booking={booking}
            open={extendOpen}
            onClose={() => setExtendOpen(false)}
            onDone={(msg) => {
              setMessage(msg);
              void load();
              void loadAudit().catch(() => setAuditEntries([]));
            }}
          />
        </>
      ) : null}
    </div>
  );
}
