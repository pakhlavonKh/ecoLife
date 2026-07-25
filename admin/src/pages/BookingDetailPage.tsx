import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { availabilityApi, bookingsApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { AvailableRoom, Booking } from '../api/types';
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
import { formatDateTime, formatMoney } from '../lib/format';
import { STATUS_ACTIONS } from '../lib/labels';

export function BookingDetailPage() {
  const { id = '' } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [cashAmount, setCashAmount] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    checkIn: '',
    checkOut: '',
    roomId: '',
    guests: 1,
    notes: '',
  });

  async function load() {
    const { data } = await bookingsApi.get(id);
    setBooking(data);
    setForm({
      firstName: data.customer.firstName,
      lastName: data.customer.lastName,
      phone: data.customer.phone,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      roomId: data.rooms[0]?.roomId ?? '',
      guests: data.rooms[0]?.bedsBooked ?? data.bedsTotal,
      notes: data.notes ?? '',
    });
    setCashAmount(data.remainingAmount);
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
    if (!form.checkIn || !form.checkOut) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await availabilityApi.admin(
          form.checkIn,
          form.checkOut,
        );
        const list = data.categories.flatMap((c) => c.availableRooms ?? []);
        if (!cancelled) {
          // Keep currently assigned room even if occupied by this booking
          const current = booking?.rooms[0];
          if (
            current &&
            !list.some((r) => r.id === current.roomId)
          ) {
            list.unshift({
              id: current.roomId,
              number: current.number,
              capacity: current.capacity,
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
  }, [form.checkIn, form.checkOut, booking]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const { data } = await bookingsApi.update(id, {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        roomId: form.roomId,
        guests: form.guests,
        notes: form.notes,
      });
      setBooking(data);
      setMessage('Сохранено');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onTransition(status: string) {
    if (status === 'cancelled' && !confirm('Отменить бронь?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await bookingsApi.transition(id, status);
      setBooking(data);
      setMessage(`Статус: ${STATUS_ACTIONS[status] ?? status}`);
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
      setMessage('Оплата наличными записана');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!booking && !error) {
    return <div className="text-[var(--muted)]">Загрузка…</div>;
  }

  return (
    <div>
      <PageHeader
        title={booking?.publicCode ?? 'Бронь'}
        subtitle={
          booking
            ? `Создана ${formatDateTime(booking.createdAt)} · ${booking.source}`
            : undefined
        }
        actions={
          <Link to="/bookings">
            <Button variant="secondary">К списку</Button>
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
          <span className="text-sm text-[var(--muted)]">
            Итого {formatMoney(booking.totalAmount)} · депозит{' '}
            {formatMoney(booking.depositAmount)} · оплачено{' '}
            {formatMoney(booking.paidAmount)} · остаток{' '}
            {formatMoney(booking.remainingAmount)}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card className="p-4">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSave}>
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
              <Input
                type="date"
                value={form.checkIn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, checkIn: e.target.value }))
                }
                required
              />
            </Field>
            <Field label="Выезд">
              <Input
                type="date"
                value={form.checkOut}
                onChange={(e) =>
                  setForm((f) => ({ ...f, checkOut: e.target.value }))
                }
                required
              />
            </Field>
            <Field label="Номер">
              <Select
                value={form.roomId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, roomId: e.target.value }))
                }
                required
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {r.cottageName} · {r.capacity} мест ·{' '}
                    {r.categoryCode}
                  </option>
                ))}
              </Select>
            </Field>
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
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Сохранить изменения
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">Действия</div>
            <div className="flex flex-col gap-2">
              {(booking?.allowedTransitions ?? []).map((s) => (
                <Button
                  key={s}
                  variant={s === 'cancelled' ? 'danger' : 'secondary'}
                  disabled={busy}
                  onClick={() => void onTransition(s)}
                >
                  {STATUS_ACTIONS[s] ?? s}
                </Button>
              ))}
              {(booking?.allowedTransitions ?? []).length === 0 ? (
                <div className="text-sm text-[var(--muted)]">
                  Нет доступных переходов
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">Оплата наличными</div>
            <Field label="Сумма (пусто = весь остаток)">
              <Input
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder={booking?.remainingAmount}
              />
            </Field>
            <Button
              className="mt-3 w-full"
              disabled={busy || booking?.paymentStatus === 'paid_full'}
              onClick={() => void onCash()}
            >
              Отметить оплату
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
