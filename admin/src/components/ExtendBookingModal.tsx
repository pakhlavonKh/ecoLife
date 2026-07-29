import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { bookingsApi, inventoryApi } from '../api/adminApi';
import { getErrorMessage, getErrorPayload } from '../api/client';
import type { Booking, Category, TransferOffer } from '../api/types';
import {
  calcAgeTotal,
  formatDate,
  formatMoney,
  nightsBetween,
} from '../lib/format';
import { DateField } from './DateField';
import { TimeField } from './TimeField';
import { Button, ErrorBox, Field, Input, Select, TextArea } from './ui';

type Props = {
  booking: Booking;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function ExtendBookingModal({ booking, open, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const last = useMemo(() => {
    const active = [...booking.rooms]
      .filter((r) => r.isActive)
      .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));
    return active[active.length - 1] ?? booking.rooms[0];
  }, [booking]);

  const [newCheckOut, setNewCheckOut] = useState(booking.checkOut);
  const [newCheckOutTime, setNewCheckOutTime] = useState(
    booking.checkOutTime || '12:00',
  );
  const [addedAmount, setAddedAmount] = useState('');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [offers, setOffers] = useState<TransferOffer[] | null>(null);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [transferToRoomId, setTransferToRoomId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setNewCheckOut(booking.checkOut);
    setNewCheckOutTime(booking.checkOutTime || '12:00');
    setAddedAmount('');
    setNote('');
    setOffers(null);
    setBlockedMessage('');
    setTransferToRoomId('');
    setError('');
    void inventoryApi.categories().then((res) => setCategories(res.data));
  }, [open, booking]);

  const currentCat = categories.find((c) => c.code === last?.categoryCode);
  const currentCheckOut = last?.checkOut ?? booking.checkOut;

  const addedNights = useMemo(() => {
    if (!newCheckOut || !currentCheckOut) return 0;
    if (newCheckOut <= currentCheckOut.slice(0, 10)) return 0;
    return nightsBetween(currentCheckOut, newCheckOut);
  }, [newCheckOut, currentCheckOut]);

  const catalogAdded = useMemo(() => {
    if (!currentCat || addedNights < 1) return 0;
    return calcAgeTotal(
      {
        priceAdult: currentCat.priceAdult,
        priceChild: currentCat.priceChild,
        priceInfant: currentCat.priceInfant,
      },
      {
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
      },
      addedNights,
    );
  }, [currentCat, addedNights, booking.adults, booking.children, booking.infants]);

  useEffect(() => {
    if (addedNights < 1) {
      setAddedAmount('');
      return;
    }
    if (addedAmount === '' || offers) {
      setAddedAmount(String(catalogAdded));
    }
    // Seed catalog amount when nights/prices change; keep bargains otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedNights, catalogAdded]);

  const offerSelected = offers?.find((o) => o.id === transferToRoomId) ?? null;

  const offerCatalogAdded = useMemo(() => {
    if (!offerSelected || addedNights < 1) return null;
    return calcAgeTotal(
      {
        priceAdult: offerSelected.priceAdult,
        priceChild: offerSelected.priceChild,
        priceInfant: offerSelected.priceInfant,
      },
      {
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
      },
      addedNights,
    );
  }, [
    offerSelected,
    addedNights,
    booking.adults,
    booking.children,
    booking.infants,
  ]);

  useEffect(() => {
    if (offerCatalogAdded == null) return;
    setAddedAmount(String(offerCatalogAdded));
  }, [offerCatalogAdded]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (addedNights < 1 && !transferToRoomId) {
      setError(t('bookingDetail.extendMustBeLater'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await bookingsApi.extend(booking.id, {
        newCheckOut,
        newCheckOutTime,
        ...(addedAmount !== '' ? { addedAmount: Number(addedAmount) } : {}),
        ...(transferToRoomId ? { transferToRoomId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onDone(
        t('bookingDetail.extendSuccess', {
          nights: data.addedNights,
          amount: formatMoney(data.addedAmount),
        }),
      );
      onClose();
    } catch (err) {
      const payload = getErrorPayload<{
        code?: string;
        transferOffers?: TransferOffer[];
        message?: string;
      }>(err);
      if (
        payload?.code === 'EXTEND_BLOCKED' &&
        Array.isArray(payload.transferOffers)
      ) {
        setOffers(payload.transferOffers);
        setBlockedMessage(
          typeof payload.message === 'string'
            ? payload.message
            : t('bookingDetail.extendBlocked'),
        );
        setTransferToRoomId('');
        setError('');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-lg rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-base font-semibold">
            {t('bookingDetail.extendTitle')}
          </h2>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </Button>
        </div>
        <form className="grid gap-3 p-4" onSubmit={onSubmit}>
          <ErrorBox message={error} />
          {last ? (
            <p className="text-sm text-[var(--muted)]">
              {t('bookingDetail.extendCurrentRoom', {
                room: last.number,
                category: last.categoryCode,
                checkOut: `${formatDate(last.checkOut ?? booking.checkOut)} ${last.checkOutTime || booking.checkOutTime}`,
              })}
            </p>
          ) : null}

          <Field label={t('bookingDetail.extendNewCheckOut')}>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <DateField
                value={newCheckOut}
                min={currentCheckOut?.slice(0, 10)}
                onChange={(v) => {
                  setNewCheckOut(v);
                  setOffers(null);
                  setBlockedMessage('');
                  setTransferToRoomId('');
                }}
                required
              />
              <TimeField
                value={newCheckOutTime}
                onChange={setNewCheckOutTime}
                required
              />
            </div>
          </Field>

          {addedNights > 0 && currentCat ? (
            <div className="rounded-md border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm">
              <p>
                {t('bookingDetail.extendCostPreview', {
                  nights: addedNights,
                  catalog: formatMoney(catalogAdded),
                })}
              </p>
              <div className="mt-2">
                <Field label={t('bookingDetail.extendAmountLabel')}>
                  <Input
                    value={addedAmount}
                    onChange={(e) => setAddedAmount(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {t('bookingDetail.extendAmountHint')}
                </p>
              </div>
            </div>
          ) : null}

          {offers ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-medium">{blockedMessage}</p>
              <p className="mt-1 text-xs">
                {t('bookingDetail.extendOffersHint')}
              </p>
              <div className="mt-2">
                <Field label={t('bookingDetail.extendOfferRoom')}>
                  <Select
                    value={transferToRoomId}
                    onChange={(e) => setTransferToRoomId(e.target.value)}
                    required
                  >
                    <option value="">
                      {t('bookingDetail.extendPickOffer')}
                    </option>
                    {offers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {t('bookingDetail.extendOfferOption', {
                          number: o.number,
                          cottage: o.cottageName,
                          category: o.categoryCode,
                          capacity: o.capacity,
                          price: formatMoney(o.priceAdult),
                        })}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          ) : null}

          <Field label={t('bookingDetail.extendNoteLabel')}>
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
            <Button
              type="submit"
              disabled={
                busy ||
                addedNights < 1 ||
                (offers != null && !transferToRoomId)
              }
            >
              {offers
                ? t('bookingDetail.extendConfirmWithTransfer')
                : t('bookingDetail.extendConfirm')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
