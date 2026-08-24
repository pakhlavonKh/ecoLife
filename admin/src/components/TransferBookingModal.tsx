import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { availabilityApi, bookingsApi, inventoryApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { AvailableRoom, Booking, Category } from '../api/types';
import {
  calcAgeTotal,
  formatDate,
  formatMoney,
  nightsBetween,
  occupyingBeds,
} from '../lib/format';
import { DateField } from './DateField';
import { TimeField } from './TimeField';
import { Button, ErrorBox, Field, MoneyInput, Select, TextArea } from './ui';

function segmentLabel(index: number): string {
  return String.fromCharCode(65 + Math.min(index, 25));
}

function activeCoveringSegment(booking: Booking, transferDate: string, transferTime: string) {
  const active = [...booking.rooms]
    .filter((r) => r.isActive)
    .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));
  if (active.length === 0) return null;
  const at = `${transferDate}T${transferTime || '00:00'}`;
  const hit = active.find((r) => {
    const start = `${(r.checkIn ?? booking.checkIn).slice(0, 10)}T${r.checkInTime || booking.checkInTime || '00:00'}`;
    const end = `${(r.checkOut ?? booking.checkOut).slice(0, 10)}T${r.checkOutTime || booking.checkOutTime || '00:00'}`;
    return start <= at && at < end;
  });
  return hit ?? active[active.length - 1]!;
}

type Props = {
  booking: Booking;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function TransferBookingModal({ booking, open, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const last = useMemo(() => {
    const active = [...booking.rooms]
      .filter((r) => r.isActive)
      .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));
    return active[active.length - 1] ?? booking.rooms[0];
  }, [booking]);

  const [transferDate, setTransferDate] = useState(
    last?.checkIn ?? booking.checkIn,
  );
  const [transferTime, setTransferTime] = useState(
    last?.checkInTime || booking.checkInTime || '14:00',
  );
  const [categoryCode, setCategoryCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [surcharge, setSurcharge] = useState('');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [candidates, setCandidates] = useState<AvailableRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTransferDate(last?.checkIn ?? booking.checkIn);
    setTransferTime(last?.checkInTime || booking.checkInTime || '14:00');
    setCategoryCode('');
    setRoomId('');
    setSurcharge('');
    setNote('');
    setError('');
    void inventoryApi.categories().then((res) => setCategories(res.data));
  }, [open, booking, last]);

  const covering = useMemo(
    () => activeCoveringSegment(booking, transferDate, transferTime),
    [booking, transferDate, transferTime],
  );

  const segmentEnd = covering?.checkOut ?? booking.checkOut;
  const segmentEndTime = covering?.checkOutTime || booking.checkOutTime || '12:00';
  const beds = occupyingBeds(booking.adults, booking.children);

  useEffect(() => {
    if (!open || !transferDate || !segmentEnd) return;
    let cancelled = false;
    (async () => {
      setLoadingRooms(true);
      try {
        const { data } = await availabilityApi.admin(transferDate, segmentEnd, {
          excludeBookingId: booking.id,
          checkInTime: transferTime,
          checkOutTime: segmentEndTime,
        });
        const list = data.categories.flatMap((c) => c.availableRooms ?? []);
        if (!cancelled) {
          setCandidates(
            list.filter(
              (r) =>
                r.id !== covering?.roomId &&
                r.remainingBeds + 2 >= beds &&
                r.capacity + 2 >= beds,
            ),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setCandidates([]);
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoadingRooms(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    transferDate,
    transferTime,
    segmentEnd,
    segmentEndTime,
    booking.id,
    covering?.roomId,
    beds,
  ]);

  const filtered = useMemo(() => {
    if (!categoryCode) return candidates;
    return candidates.filter((r) => r.categoryCode === categoryCode);
  }, [candidates, categoryCode]);

  const selected = filtered.find((r) => r.id === roomId) ?? null;

  const oldCat = categories.find((c) => c.code === covering?.categoryCode);
  const livedNights = useMemo(() => {
    if (!covering) return 0;
    const start = covering.checkIn ?? booking.checkIn;
    if (transferDate === start.slice(0, 10) && transferTime === (covering.checkInTime || booking.checkInTime)) {
      return 0;
    }
    return nightsBetween(start, transferDate);
  }, [covering, booking, transferDate, transferTime]);

  const remainingNights = useMemo(() => {
    if (!covering) return 0;
    const end = covering.checkOut ?? booking.checkOut;
    if (livedNights === 0) {
      return nightsBetween(covering.checkIn ?? booking.checkIn, end);
    }
    return nightsBetween(transferDate, end);
  }, [covering, booking, transferDate, livedNights]);

  const counts = {
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
  };

  const moneyPreview = useMemo(() => {
    if (!selected || !oldCat) return null;
    const oldPrices = {
      priceAdult: oldCat.priceAdult,
      priceChild: oldCat.priceChild,
      priceInfant: oldCat.priceInfant,
    };
    const newPrices = {
      priceAdult: selected.priceAdult ?? selected.pricePerNight,
      priceChild: selected.priceChild ?? '0',
      priceInfant: selected.priceInfant ?? '0',
    };
    const sameCategory = selected.categoryCode === covering?.categoryCode;
    const livedAmount = calcAgeTotal(oldPrices, counts, livedNights);
    const oldRemaining = calcAgeTotal(oldPrices, counts, remainingNights);
    const newRemaining = calcAgeTotal(newPrices, counts, remainingNights);
    const suggested = sameCategory
      ? 0
      : Math.round((newRemaining - oldRemaining) * 100) / 100;
    return {
      sameCategory,
      livedAmount,
      oldRemaining,
      newRemaining,
      suggested,
      oldNightly: calcAgeTotal(oldPrices, counts, 1),
      newNightly: calcAgeTotal(newPrices, counts, 1),
    };
  }, [
    selected,
    oldCat,
    covering?.categoryCode,
    livedNights,
    remainingNights,
    counts.adults,
    counts.children,
    counts.infants,
  ]);

  useEffect(() => {
    if (!moneyPreview) return;
    if (moneyPreview.sameCategory) {
      setSurcharge('0');
    } else if (surcharge === '' || surcharge === '0') {
      setSurcharge(String(moneyPreview.suggested));
    }
    // Only seed when room/category changes — do not fight admin edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, moneyPreview?.sameCategory, moneyPreview?.suggested]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomId) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await bookingsApi.transfer(booking.id, {
        roomId,
        transferDate,
        transferTime,
        ...(moneyPreview && !moneyPreview.sameCategory
          ? { surchargeAmount: Number(surcharge || 0) }
          : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const msg =
        data.operation === 'upgrade'
          ? t('bookingDetail.transferSuccessUpgrade', {
              surcharge: formatMoney(data.surchargeAmount),
            })
          : t('bookingDetail.transferSuccessSame');
      onDone(msg);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const categoryOptions = useMemo(() => {
    const codes = new Set(candidates.map((r) => r.categoryCode));
    return categories.filter((c) => codes.has(c.code));
  }, [candidates, categories]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-lg rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-base font-semibold">
            {t('bookingDetail.transferTitle')}
          </h2>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </Button>
        </div>
        <form className="grid gap-3 p-4" onSubmit={onSubmit}>
          <ErrorBox message={error} />
          {covering ? (
            <p className="text-sm text-[var(--muted)]">
              {t('bookingDetail.transferCurrentSegment', {
                letter: segmentLabel(covering.segmentIndex ?? 0),
                room: covering.number,
                category: covering.categoryCode,
                checkIn: `${formatDate(covering.checkIn ?? booking.checkIn)} ${covering.checkInTime || booking.checkInTime}`,
                checkOut: `${formatDate(covering.checkOut ?? booking.checkOut)} ${covering.checkOutTime || booking.checkOutTime}`,
              })}
            </p>
          ) : null}

          <Field label={t('bookingDetail.transferAtLabel')}>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <DateField
                value={transferDate}
                min={booking.checkIn}
                onChange={setTransferDate}
                required
              />
              <TimeField
                value={transferTime}
                onChange={setTransferTime}
                required
              />
            </div>
          </Field>

          <Field label={t('bookingDetail.transferCategoryLabel')}>
            <Select
              value={categoryCode}
              onChange={(e) => {
                setCategoryCode(e.target.value);
                setRoomId('');
              }}
            >
              <option value="">{t('bookingDetail.transferCategoryAll')}</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('bookingDetail.transferRoomLabel')}>
            <Select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setSurcharge('');
              }}
              required
              disabled={loadingRooms || filtered.length === 0}
            >
              <option value="">
                {loadingRooms
                  ? t('common.loading')
                  : filtered.length === 0
                    ? t('bookingDetail.transferNoRooms')
                    : t('bookingDetail.transferPickRoom')}
              </option>
              {filtered.map((r) => (
                <option key={r.id} value={r.id}>
                  {t('bookingDetail.transferRoomOption', {
                    number: r.number,
                    cottage: r.cottageName,
                    remaining: r.remainingBeds,
                    capacity: r.capacity,
                    category: r.categoryCode,
                    price: formatMoney(r.priceAdult ?? r.pricePerNight),
                  })}
                </option>
              ))}
            </Select>
          </Field>

          {moneyPreview && selected ? (
            <div className="rounded-md border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950">
              <div className="font-medium">
                {moneyPreview.sameCategory
                  ? t('bookingDetail.transferSameClass')
                  : t('bookingDetail.transferUpgrade')}
              </div>
              <p className="mt-1 text-[var(--ink)]">
                {t('bookingDetail.transferBreakdown', {
                  lived: livedNights,
                  oldPrice: formatMoney(moneyPreview.oldNightly),
                  remaining: remainingNights,
                  newPrice: formatMoney(moneyPreview.newNightly),
                })}
              </p>
              {!moneyPreview.sameCategory ? (
                <div className="mt-2">
                  <Field label={t('bookingDetail.transferSurchargeLabel')}>
                    <MoneyInput
                      value={surcharge}
                      onValueChange={(val) => setSurcharge(val)}
                      required
                    />
                  </Field>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {t('bookingDetail.transferSurchargeHint', {
                      suggested: formatMoney(moneyPreview.suggested),
                    })}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {t('bookingDetail.transferNoSurcharge')}
                </p>
              )}
            </div>
          ) : null}

          <Field label={t('bookingDetail.transferNoteLabel')}>
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !roomId}>
              {t('bookingDetail.transferConfirm')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
