import { useEffect, useState, type FormEvent } from 'react';
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

export function BookingCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
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
      const { data } = await bookingsApi.createManual({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
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
        title="Ручная бронь"
        subtitle="Тот же availability-движок, статус confirmed, без онлайн-оплаты"
        actions={
          <Link to="/bookings">
            <Button variant="secondary">Отмена</Button>
          </Link>
        }
      />
      <Card className="max-w-3xl p-4 sm:p-6">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Имя">
            <Input
              value={form.firstName}
              onChange={(e) =>
                setForm((f) => ({ ...f, firstName: e.target.value }))
              }
              required
            />
          </Field>
          <Field label="Фамилия">
            <Input
              value={form.lastName}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastName: e.target.value }))
              }
              required
            />
          </Field>
          <Field label="Телефон">
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              required
            />
          </Field>
          <Field label="Гостей">
            <Input
              type="number"
              min={1}
              value={form.guests}
              onChange={(e) =>
                setForm((f) => ({ ...f, guests: Number(e.target.value) }))
              }
            />
          </Field>
          <Field label="Заезд">
            <DateField
              value={form.checkIn}
              onChange={(checkIn) => setForm((f) => ({ ...f, checkIn }))}
              required
            />
          </Field>
          <Field label="Выезд">
            <DateField
              value={form.checkOut}
              min={form.checkIn || undefined}
              onChange={(checkOut) => setForm((f) => ({ ...f, checkOut }))}
              required
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Свободный номер">
              <Select
                value={form.roomId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, roomId: e.target.value }))
                }
                required
              >
                <option value="" disabled>
                  {rooms.length ? 'Выберите номер' : 'Нет свободных номеров'}
                </option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {r.cottageName} · {r.capacity} мест ·{' '}
                    {r.categoryCode} · {formatMoney(r.pricePerNight)}/ночь
                  </option>
                ))}
              </Select>
            </Field>
            {selected ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Выбрано: {selected.number} ({selected.cottageName}),{' '}
                {selected.capacity} мест, {formatMoney(selected.pricePerNight)}{' '}
                / ночь
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Field label="Заметки">
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
              {busy ? 'Создание…' : 'Создать бронь'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
