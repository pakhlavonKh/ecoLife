import type {
  BookingFieldChange,
  BookingSnapshot,
} from '../bookings/events/booking.events';
import type { PaymentReceivedPayload } from '../payments/events/payment.events';

/** Escape user-controlled text for Telegram HTML parse mode. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(amount: string): string {
  return `${escapeHtml(amount)} UZS`;
}

function roomsLine(booking: BookingSnapshot): string {
  if (booking.rooms.length === 0) {
    return '—';
  }
  return booking.rooms
    .map(
      (r) =>
        `${escapeHtml(r.cottageName)} / ${escapeHtml(r.number)} (${escapeHtml(r.categoryName)})`,
    )
    .join(', ');
}

function categoryLine(booking: BookingSnapshot): string {
  const names = [...new Set(booking.rooms.map((r) => r.categoryName))];
  return names.length > 0 ? names.map(escapeHtml).join(', ') : '—';
}

function sourceLabel(source: string): string {
  if (source === 'online') return 'онлайн';
  if (source === 'manual') return 'ручная';
  return escapeHtml(source);
}

function guestLine(booking: BookingSnapshot): string {
  return `${escapeHtml(booking.firstName)} ${escapeHtml(booking.lastName)}`;
}

export function formatNewBooking(booking: BookingSnapshot): string {
  return [
    '<b>Новое бронирование</b>',
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Категория: ${categoryLine(booking)}`,
    `Коттедж / номер: ${roomsLine(booking)}`,
    `Мест: ${booking.bedsTotal}`,
    `Заезд: ${escapeHtml(booking.checkIn)}`,
    `Выезд: ${escapeHtml(booking.checkOut)}`,
    `Итого: ${fmtMoney(booking.totalAmount)}`,
    `Депозит: ${fmtMoney(booking.depositAmount)}`,
    `Оплачено: ${fmtMoney(booking.paidAmount)}`,
    `Остаток: ${fmtMoney(booking.remainingAmount)}`,
    `Источник: ${sourceLabel(booking.source)}`,
    `Статус: ${escapeHtml(booking.status)}`,
  ].join('\n');
}

export function formatPaymentReceived(
  payment: PaymentReceivedPayload,
): string {
  return [
    '<b>Оплата получена</b>',
    `Код брони: <code>${escapeHtml(payment.publicCode)}</code>`,
    `Провайдер: ${escapeHtml(payment.provider)}`,
    `Сумма: ${fmtMoney(payment.amount)}`,
    `Txn: <code>${escapeHtml(payment.providerTxnId || '—')}</code>`,
  ].join('\n');
}

export function formatCheckIn(booking: BookingSnapshot): string {
  return [
    '<b>Заезд</b>',
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Коттедж / номер: ${roomsLine(booking)}`,
    `Заезд: ${escapeHtml(booking.checkIn)} → Выезд: ${escapeHtml(booking.checkOut)}`,
  ].join('\n');
}

export function formatCheckOut(booking: BookingSnapshot): string {
  return [
    '<b>Выезд</b>',
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Коттедж / номер: ${roomsLine(booking)}`,
    `Выезд: ${escapeHtml(booking.checkOut)}`,
  ].join('\n');
}

export function formatBookingCancelled(
  booking: BookingSnapshot,
  opts?: { holdExpired?: boolean },
): string {
  const title = opts?.holdExpired
    ? '<b>Бронирование отменено</b> (авто-истечение холда)'
    : '<b>Бронирование отменено</b>';
  return [
    title,
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Коттедж / номер: ${roomsLine(booking)}`,
    `Даты: ${escapeHtml(booking.checkIn)} → ${escapeHtml(booking.checkOut)}`,
    `Статус: ${escapeHtml(booking.status)}`,
  ].join('\n');
}

export function formatStatusChanged(
  booking: BookingSnapshot,
  previousStatus: string,
  nextStatus: string,
): string {
  return [
    '<b>Статус бронирования изменён</b>',
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Статус: ${escapeHtml(previousStatus)} → ${escapeHtml(nextStatus)}`,
  ].join('\n');
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'Имя',
  lastName: 'Фамилия',
  phone: 'Телефон',
  roomNumber: 'Номер',
  cottageName: 'Коттедж',
  category: 'Категория',
  checkIn: 'Заезд',
  checkOut: 'Выезд',
  notes: 'Заметки',
  totalAmount: 'Итого',
  depositAmount: 'Депозит',
  paymentStatus: 'Оплата',
  bedsTotal: 'Мест',
};

export function formatBookingEdited(
  publicCode: string,
  changes: BookingFieldChange[],
): string {
  const lines = changes.map((c) => {
    const label = FIELD_LABELS[c.field] ?? c.field;
    const from = c.from === '' || c.from == null ? '—' : escapeHtml(c.from);
    const to = c.to === '' || c.to == null ? '—' : escapeHtml(c.to);
    return `• ${escapeHtml(label)}: ${from} → ${to}`;
  });
  return [
    '<b>Бронирование изменено</b>',
    `Код: <code>${escapeHtml(publicCode)}</code>`,
    ...lines,
  ].join('\n');
}

export type TodayBrief = {
  publicCode: string;
  customerName: string;
  phone: string;
  rooms: string[];
  checkIn: string;
  checkOut: string;
  status: string;
};

export function formatToday(
  date: string,
  arrivals: TodayBrief[],
  departures: TodayBrief[],
): string {
  const fmtList = (items: TodayBrief[], empty: string): string => {
    if (items.length === 0) return empty;
    return items
      .map((b, i) => {
        const rooms = b.rooms.length
          ? b.rooms.map(escapeHtml).join(', ')
          : '—';
        return (
          `${i + 1}. <code>${escapeHtml(b.publicCode)}</code> — ` +
          `${escapeHtml(b.customerName)}, ${escapeHtml(b.phone)}\n` +
          `   ${rooms} (${escapeHtml(b.status)})`
        );
      })
      .join('\n');
  };

  return [
    `<b>Сегодня ${escapeHtml(date)}</b>`,
    '',
    `<b>Заезды (${arrivals.length})</b>`,
    fmtList(arrivals, 'Нет заездов'),
    '',
    `<b>Выезды (${departures.length})</b>`,
    fmtList(departures, 'Нет выездов'),
  ].join('\n');
}
