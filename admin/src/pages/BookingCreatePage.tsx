import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { availabilityApi, bookingsApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { AvailableRoom } from '../api/types';
import { DateField } from '../components/DateField';
import { TimeField } from '../components/TimeField';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Select,
  TextArea,
} from '../components/ui';
import {
  addDaysIso,
  calcAgeTotal,
  calcDeposit,
  cleaningBlockedUntil,
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  formatMoney,
  nightsBetween,
  occupyingBeds,
  todayIso,
} from '../lib/format';
import { splitGuestName } from '../lib/guest-name';

export function BookingCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    guestName: '',
    phone: '+998',
    checkIn: todayIso(),
    checkOut: addDaysIso(2),
    checkInTime: DEFAULT_CHECK_IN_TIME,
    checkOutTime: DEFAULT_CHECK_OUT_TIME,
    adults: 2,
    children: 0,
    infants: 0,
    roomId: '',
    notes: '',
  });
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [depositByCategory, setDepositByCategory] = useState<
    Record<string, number>
  >({});
  const [bufferMinutes, setBufferMinutes] = useState(60);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const bedsNeeded = occupyingBeds(form.adults, form.children);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await availabilityApi.admin(
          form.checkIn,
          form.checkOut,
          {
            checkInTime: form.checkInTime,
            checkOutTime: form.checkOutTime,
          },
        );
        const deposits: Record<string, number> = {};
        for (const c of data.categories) {
          deposits[c.code] = c.depositPercent;
        }
        const list = data.categories
          .flatMap((c) => c.availableRooms ?? [])
          .filter((r) => (r.remainingBeds ?? 0) >= bedsNeeded)
          .sort((a, b) => {
            if (a.capacity !== b.capacity) return a.capacity - b.capacity;
            return a.number.localeCompare(b.number, undefined, {
              numeric: true,
            });
          });
        if (!cancelled) {
          setDepositByCategory(deposits);
          setRooms(list);
          if (typeof data.cleaningBufferMinutes === 'number') {
            setBufferMinutes(data.cleaningBufferMinutes);
          }
          setForm((f) => ({
            ...f,
            roomId: list.some((r) => r.id === f.roomId)
              ? f.roomId
              : list[0]?.id ?? '',
          }));
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
    bedsNeeded,
  ]);

  const selected = rooms.find((r) => r.id === form.roomId);
  const nights = nightsBetween(form.checkIn, form.checkOut);
  const bufferUntil = cleaningBlockedUntil(
    form.checkOut,
    form.checkOutTime,
    bufferMinutes,
  );

  const pricePreview = useMemo(() => {
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
    const depositPercent =
      depositByCategory[selected.categoryCode] ?? 0;
    const deposit = calcDeposit(total, depositPercent);
    return {
      ...prices,
      ...counts,
      nights,
      beds: occupyingBeds(form.adults, form.children),
      total,
      depositPercent,
      deposit,
      remaining: Math.max(0, total - deposit),
    };
  }, [selected, nights, form.adults, form.children, form.infants, depositByCategory]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { firstName, lastName } = splitGuestName(form.guestName);
      const { data } = await bookingsApi.createManual({
        firstName,
        lastName,
        phone: form.phone.trim(),
        roomId: form.roomId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        adults: form.adults,
        children: form.children,
        infants: form.infants,
        notes: form.notes.trim() || undefined,
      });
      navigate(`/bookings/${data.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('bookingCreate.title')}
        subtitle={t('bookingCreate.subtitle')}
        actions={
          <Link to="/bookings">
            <Button variant="secondary">{t('common.cancel')}</Button>
          </Link>
        }
      />
      <Card className="max-w-3xl p-4 sm:p-6">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
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
            {t('common.guestAgeHint', { beds: bedsNeeded })}
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
          {bufferMinutes > 0 ? (
            <p className="sm:col-span-2 -mt-1 text-xs text-[var(--muted)]">
              {t('bookingCreate.cleaningBufferHint', {
                until: bufferUntil.label,
                minutes: bufferMinutes,
              })}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Field label={t('bookingCreate.freeRoom')}>
              <Select
                value={form.roomId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, roomId: e.target.value }))
                }
                required
              >
                <option value="" disabled>
                  {rooms.length
                    ? t('bookingCreate.selectRoom')
                    : t('bookingCreate.noFreeRooms')}
                </option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t('bookingCreate.roomOption', {
                      number: r.number,
                      cottage: r.cottageName,
                      remaining: r.remainingBeds,
                      capacity: r.capacity,
                      category: r.categoryCode,
                      price: formatMoney(r.pricePerNight),
                    })}
                  </option>
                ))}
              </Select>
            </Field>
            {selected ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                {t('bookingCreate.selectedSummary', {
                  number: selected.number,
                  cottage: selected.cottageName,
                  remaining: selected.remainingBeds,
                  capacity: selected.capacity,
                  price: formatMoney(selected.pricePerNight),
                })}
              </p>
            ) : null}
          </div>

          {pricePreview ? (
            <div className="sm:col-span-2 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
              <div className="font-medium text-stone-800">
                {t('bookingCreate.pricePreviewTitle')}
              </div>
              <div className="mt-1 text-[var(--muted)]">
                {t('bookingCreate.pricePreviewFormula', {
                  adults: pricePreview.adults,
                  priceAdult: formatMoney(pricePreview.priceAdult),
                  children: pricePreview.children,
                  priceChild: formatMoney(pricePreview.priceChild),
                  infants: pricePreview.infants,
                  priceInfant: formatMoney(pricePreview.priceInfant),
                  nightly: formatMoney(
                    pricePreview.total / Math.max(1, pricePreview.nights),
                  ),
                  nights: pricePreview.nights,
                })}
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-3">
                <div>
                  {t('bookingCreate.priceTotal')}:{' '}
                  <strong>{formatMoney(pricePreview.total)}</strong>
                </div>
                <div>
                  {t('bookingCreate.priceDeposit', {
                    percent: pricePreview.depositPercent,
                  })}
                  : <strong>{formatMoney(pricePreview.deposit)}</strong>
                </div>
                <div>
                  {t('bookingCreate.priceRemaining')}:{' '}
                  <strong>{formatMoney(pricePreview.remaining)}</strong>
                </div>
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
          <div className="sm:col-span-2 space-y-3">
            <ErrorBox message={error} />
            <Button type="submit" disabled={busy || !form.roomId}>
              {busy ? t('bookingCreate.creating') : t('bookingCreate.create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
