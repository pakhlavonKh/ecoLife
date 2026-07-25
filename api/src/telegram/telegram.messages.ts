import type {
  BookingFieldChange,
  BookingSnapshot,
} from '../bookings/events/booking.events';
import { formatGuestName } from '../common/utils/guest-name';
import type { PaymentReceivedPayload } from '../payments/events/payment.events';

/** Escape user-controlled text for Telegram HTML parse mode. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatDateRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return escapeHtml(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const COTTAGE_RU: Record<string, string> = {
  'Seshanba kottej': 'Коттедж Вторник',
  'Chorshanba kottej': 'Коттедж Среда',
  'Payshanba kottej': 'Коттедж Четверг',
  'Juma kottej': 'Коттедж Пятница',
  'Shanba kottej': 'Коттедж Суббота',
  'Yakshanba kottej': 'Коттедж Воскресенье',
};

function cottageLabel(name: string): string {
  return escapeHtml(COTTAGE_RU[name] ?? name);
}

function fmtMoney(amount: string): string {
  return `${escapeHtml(amount)} UZS`;
}

function roomsLine(booking: BookingSnapshot): string {
  if (booking.rooms.length === 0) {
    return '—';
  }
  return booking.rooms
    .map((r) => `${cottageLabel(r.cottageName)} / ${escapeHtml(r.number)}`)
    .join(', ');
}

function guestLine(booking: BookingSnapshot): string {
  return escapeHtml(formatGuestName(booking.firstName, booking.lastName));
}

/** Compact new-booking alert — payment details come in a separate message. */
export function formatNewBooking(booking: BookingSnapshot): string {
  return [
    '<b>Новое бронирование</b>',
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Номер: ${roomsLine(booking)}`,
    `Заезд: ${formatDateRu(booking.checkIn)}`,
    `Выезд: ${formatDateRu(booking.checkOut)}`,
    `Депозит: ${fmtMoney(booking.depositAmount)}`,
  ].join('\n');
}

export function formatPaymentReceived(
  payment: PaymentReceivedPayload,
): string {
  return [
    '<b>Оплата получена</b>',
    `Код: <code>${escapeHtml(payment.publicCode)}</code>`,
    `Сумма: ${fmtMoney(payment.amount)}`,
  ].join('\n');
}

export function formatCheckIn(booking: BookingSnapshot): string {
  return [
    '<b>Заезд</b>',
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Номер: ${roomsLine(booking)}`,
    `Даты: ${formatDateRu(booking.checkIn)} → ${formatDateRu(booking.checkOut)}`,
  ].join('\n');
}

export function formatCheckOut(booking: BookingSnapshot): string {
  return [
    '<b>Выезд</b>',
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Номер: ${roomsLine(booking)}`,
    `Выезд: ${formatDateRu(booking.checkOut)}`,
  ].join('\n');
}

export function formatBookingCancelled(
  booking: BookingSnapshot,
  opts?: { holdExpired?: boolean },
): string {
  const title = opts?.holdExpired
    ? '<b>Бронирование отменено</b> (холд истёк)'
    : '<b>Бронирование отменено</b>';
  return [
    title,
    `Код: <code>${escapeHtml(booking.publicCode)}</code>`,
    `Гость: ${guestLine(booking)}`,
    `Телефон: ${escapeHtml(booking.phone)}`,
    `Номер: ${roomsLine(booking)}`,
    `Даты: ${formatDateRu(booking.checkIn)} → ${formatDateRu(booking.checkOut)}`,
  ].join('\n');
}

export function formatStatusChanged(
  booking: BookingSnapshot,
  previousStatus: string,
  nextStatus: string,
): string {
  return [
    '<b>Статус изменён</b>',
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

const DATE_FIELDS = new Set(['checkIn', 'checkOut']);

export function formatBookingEdited(
  publicCode: string,
  changes: BookingFieldChange[],
): string {
  const lines = changes.map((c) => {
    const label = FIELD_LABELS[c.field] ?? c.field;
    const fmt = (v: string | null | undefined) => {
      if (v === '' || v == null) return '—';
      if (DATE_FIELDS.has(c.field)) return formatDateRu(v);
      return escapeHtml(v);
    };
    return `• ${escapeHtml(label)}: ${fmt(c.from)} → ${fmt(c.to)}`;
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
          `   ${rooms}`
        );
      })
      .join('\n');
  };

  return [
    `<b>Сегодня ${formatDateRu(date)}</b>`,
    '',
    `<b>Заезды (${arrivals.length})</b>`,
    fmtList(arrivals, 'Нет заездов'),
    '',
    `<b>Выезды (${departures.length})</b>`,
    fmtList(departures, 'Нет выездов'),
  ].join('\n');
}
