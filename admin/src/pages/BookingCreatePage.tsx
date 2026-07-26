import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { availabilityApi, bookingsApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { AvailableRoom } from '../api/types';
import { DateField } from '../components/DateField';
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
import { addDaysIso, formatMoney, todayIso } from '../lib/format';
import { splitGuestName } from '../lib/guest-name';

export function BookingCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    guestName: '',
    phone: '+998',
    checkIn: todayIso(),
    checkOut: addDaysIso(2),
    guests: 2,
    roomId: '',
    notes: '',
  });
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await availabilityApi.admin(
          form.checkIn,
          form.checkOut,
        );
        const list = data.categories
          .flatMap((c) => c.availableRooms ?? [])
          .filter((r) => r.capacity >= form.guests)
          .sort((a, b) => a.capacity - b.capacity);
        if (!cancelled) {
          setRooms(list);
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
  }, [form.checkIn, form.checkOut, form.guests]);

  const selected = rooms.find((r) => r.id === form.roomId);

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
        guests: form.guests,
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
                  capacity: selected.capacity,
                  price: formatMoney(selected.pricePerNight),
                })}
              </p>
            ) : null}
          </div>
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
