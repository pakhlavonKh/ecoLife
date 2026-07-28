import type {
  BookingFieldChange,
  BookingSnapshot,
} from '../bookings/events/booking.events';
import { formatGuestName } from '../common/utils/guest-name';
import type {
  PaymentFailedPayload,
  PaymentLateManualReviewPayload,
  PaymentReceivedPayload,
} from '../payments/events/payment.events';
import type { RoomLockCreatedPayload } from '../room-locks/events/room-lock.events';
import {
  DEFAULT_TELEGRAM_LANG,
  dict,
  tt,
  type TelegramLang,
} from './i18n';
import type { MessageScope } from './telegram.routing';

export type { TelegramLang };

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

/** YYYY-MM-DD → DD.MM (short range for room-lock alerts) */
export function formatDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return escapeHtml(iso);
  return `${m[3]}.${m[2]}`;
}

function cottageLabel(name: string, lang: TelegramLang): string {
  const mapped = (dict(lang).cottages as Record<string, string>)[name];
  return escapeHtml(mapped ?? name);
}

function fmtMoney(amount: string, lang: TelegramLang): string {
  return `${fmtMoneyAmount(amount, lang)} UZS`;
}

function fmtMoneyAmount(amount: string, lang: TelegramLang): string {
  const n = Number(amount);
  const locale = lang === 'uz' ? 'uz-UZ' : 'ru-RU';
  if (!Number.isFinite(n)) {
    return escapeHtml(amount);
  }
  return n.toLocaleString(locale);
}

function roomsLine(booking: BookingSnapshot, lang: TelegramLang): string {
  if (booking.rooms.length === 0) {
    return tt(lang, 'common.emDash');
  }
  return booking.rooms
    .map(
      (r) =>
        `${cottageLabel(r.cottageName, lang)} / ${escapeHtml(r.number)}`,
    )
    .join(', ');
}

/** Per-room occupancy lines: «мест в номере: X/Y занято». */
function bedsOccupancyLines(
  booking: BookingSnapshot,
  lang: TelegramLang,
): string[] {
  if (booking.rooms.length === 0) {
    return [];
  }
  return booking.rooms.map((r) =>
    tt(lang, 'common.bedsInRoom', {
      booked: String(r.bedsBooked),
      capacity: String(r.capacity),
    }),
  );
}

function guestLine(booking: BookingSnapshot): string {
  return escapeHtml(formatGuestName(booking.firstName, booking.lastName));
}

/** Compact core for admin/manager/owner alerts — bed-mode guests + occupancy. */
function compactBookingLines(
  booking: BookingSnapshot,
  lang: TelegramLang,
  opts?: { includePhone?: boolean; includeDeposit?: boolean },
): string[] {
  const lines = [
    `${tt(lang, 'common.code')}: <code>${escapeHtml(booking.publicCode)}</code>`,
    `${tt(lang, 'common.guest')}: ${guestLine(booking)}`,
  ];
  if (opts?.includePhone !== false) {
    lines.push(
      `${tt(lang, 'common.phone')}: ${escapeHtml(booking.phone)}`,
    );
  }
  lines.push(
    `${tt(lang, 'common.guests')}: ${booking.bedsTotal}`,
    `${tt(lang, 'common.room')}: ${roomsLine(booking, lang)}`,
    ...bedsOccupancyLines(booking, lang),
    `${tt(lang, 'common.dates')}: ${formatDateRu(booking.checkIn)} → ${formatDateRu(booking.checkOut)}`,
  );
  if (opts?.includeDeposit) {
    lines.push(
      `${tt(lang, 'common.deposit')}: ${fmtMoney(booking.depositAmount, lang)}`,
    );
  }
  return lines;
}

/** Cleaner checkout lines — cottage + room + date only (§5). */
export function formatCleanerCheckout(
  booking: BookingSnapshot,
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string {
  if (booking.rooms.length === 0) {
    return [
      tt(lang, 'cleaner.freedGeneric'),
      tt(lang, 'cleaner.checkoutDate', {
        date: formatDateRu(booking.checkOut),
      }),
      tt(lang, 'cleaner.canClean'),
    ].join('\n');
  }
  return booking.rooms
    .map((r) =>
      tt(lang, 'cleaner.freedRoom', {
        number: escapeHtml(r.number),
        cottage: escapeHtml(r.cottageName),
      }),
    )
    .join('\n');
}

/** New booking — guests, room, beds taken / capacity. */
export function formatNewBooking(
  booking: BookingSnapshot,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  const isRequest = booking.source === 'online_request';
  const lines = [
    `<b>${tt(lang, isRequest ? 'events.newRequest' : 'events.newBooking')}</b>`,
    ...compactBookingLines(booking, lang, { includeDeposit: true }),
  ];
  if (isRequest) {
    lines.push(tt(lang, 'events.requestNeedsConfirm'));
  }
  return lines.join('\n');
}

export function formatPaymentReceived(
  payment: PaymentReceivedPayload,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  const lines = [
    `<b>${tt(lang, 'events.paymentReceived')}</b>`,
    `${tt(lang, 'common.code')}: <code>${escapeHtml(payment.publicCode)}</code>`,
    `${tt(lang, 'common.amount')}: ${fmtMoney(payment.amount, lang)}`,
  ];
  if (payment.priceAdjustment) {
    const a = payment.priceAdjustment;
    lines.push(
      tt(lang, 'events.paymentAmountAdjusted', {
        from: fmtMoneyAmount(a.priceOriginal, lang),
        to: fmtMoneyAmount(a.totalAmount, lang),
        deposit: fmtMoneyAmount(a.depositAmount, lang),
        remaining: fmtMoneyAmount(a.remainingAmount, lang),
      }),
    );
  }
  return lines.join('\n');
}

export function formatCheckIn(
  booking: BookingSnapshot,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  return [
    `<b>${tt(lang, 'events.checkIn')}</b>`,
    ...compactBookingLines(booking, lang),
  ].join('\n');
}

export function formatCheckOut(
  booking: BookingSnapshot,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return formatCleanerCheckout(booking, lang);
  }
  return [
    `<b>${tt(lang, 'events.checkOut')}</b>`,
    `${tt(lang, 'common.code')}: <code>${escapeHtml(booking.publicCode)}</code>`,
    `${tt(lang, 'common.guest')}: ${guestLine(booking)}`,
    `${tt(lang, 'common.guests')}: ${booking.bedsTotal}`,
    `${tt(lang, 'common.room')}: ${roomsLine(booking, lang)}`,
    ...bedsOccupancyLines(booking, lang),
    `${tt(lang, 'common.checkOut')}: ${formatDateRu(booking.checkOut)}`,
  ].join('\n');
}

export function formatBookingCancelled(
  booking: BookingSnapshot,
  opts?: {
    holdExpired?: boolean;
    scope?: MessageScope;
    lang?: TelegramLang;
  },
): string | null {
  const scope = opts?.scope ?? 'full';
  const lang = opts?.lang ?? DEFAULT_TELEGRAM_LANG;
  if (scope === 'cleaner') {
    return null;
  }
  const title = opts?.holdExpired
    ? `<b>${tt(lang, 'events.cancelled')}</b> ${tt(lang, 'events.cancelledHoldSuffix')}`
    : `<b>${tt(lang, 'events.cancelled')}</b>`;
  return [title, ...compactBookingLines(booking, lang)].join('\n');
}

export function formatHoldExpired(
  booking: BookingSnapshot,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  return [
    `<b>${tt(lang, 'events.holdExpired')}</b>`,
    `${tt(lang, 'common.code')}: <code>${escapeHtml(booking.publicCode)}</code>`,
    `${tt(lang, 'common.guest')}: ${guestLine(booking)}`,
    `${tt(lang, 'common.guests')}: ${booking.bedsTotal}`,
    `${tt(lang, 'common.room')}: ${roomsLine(booking, lang)}`,
    ...bedsOccupancyLines(booking, lang),
    `${tt(lang, 'common.dates')}: ${formatDateRu(booking.checkIn)} → ${formatDateRu(booking.checkOut)}`,
  ].join('\n');
}

export function formatStatusChanged(
  booking: BookingSnapshot,
  previousStatus: string,
  nextStatus: string,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  return [
    `<b>${tt(lang, 'events.statusChanged')}</b>`,
    `${tt(lang, 'common.code')}: <code>${escapeHtml(booking.publicCode)}</code>`,
    `${tt(lang, 'common.guest')}: ${guestLine(booking)}`,
    `${escapeHtml(previousStatus)} → ${escapeHtml(nextStatus)}`,
  ].join('\n');
}

const DATE_FIELDS = new Set(['checkIn', 'checkOut']);

export function formatBookingEdited(
  publicCode: string,
  changes: BookingFieldChange[],
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  const fieldLabels = dict(lang).fields as Record<string, string>;
  const lines = changes.map((c) => {
    const label = fieldLabels[c.field] ?? c.field;
    const fmt = (v: string | null | undefined) => {
      if (v === '' || v == null) return tt(lang, 'common.emDash');
      if (DATE_FIELDS.has(c.field)) return formatDateRu(v);
      return escapeHtml(v);
    };
    return `• ${escapeHtml(label)}: ${fmt(c.from)} → ${fmt(c.to)}`;
  });
  return [
    `<b>${tt(lang, 'events.bookingEdited')}</b>`,
    `${tt(lang, 'common.code')}: <code>${escapeHtml(publicCode)}</code>`,
    ...lines,
  ].join('\n');
}

export function formatPaymentFailed(
  payment: PaymentFailedPayload,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  return [
    `<b>${tt(lang, 'events.paymentFailed')}</b>`,
    `${tt(lang, 'common.code')}: <code>${escapeHtml(payment.publicCode)}</code>`,
    payment.reason
      ? `${tt(lang, 'common.reason')}: ${escapeHtml(payment.reason)}`
      : tt(lang, 'events.paymentFailedHint'),
  ].join('\n');
}

export function formatLatePaymentReview(
  payment: PaymentLateManualReviewPayload,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  return [
    `<b>${tt(lang, 'events.latePaymentReview')}</b>`,
    `${tt(lang, 'common.code')}: <code>${escapeHtml(payment.publicCode)}</code>`,
    `${tt(lang, 'common.amount')}: ${fmtMoney(payment.amount, lang)}`,
    `${tt(lang, 'common.bookingStatus')}: ${escapeHtml(payment.bookingStatus)}`,
  ].join('\n');
}

/** Whole-room lock — optional admin alert (no cleaner). */
export function formatRoomLocked(
  lock: RoomLockCreatedPayload,
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    return null;
  }
  const line = tt(lang, 'events.roomLocked', {
    number: escapeHtml(lock.roomNumber),
    from: formatDateShort(lock.checkIn),
    to: formatDateShort(lock.checkOut),
  });
  const lines = [`<b>${line}</b>`];
  if (lock.cottageName) {
    lines.push(
      `${tt(lang, 'common.room')}: ${cottageLabel(lock.cottageName, lang)} / ${escapeHtml(lock.roomNumber)}`,
    );
  }
  if (lock.reason) {
    lines.push(
      `${tt(lang, 'common.reason')}: ${escapeHtml(lock.reason)}`,
    );
  }
  return lines.join('\n');
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

/** Admin /today — arrivals + departures with guest PII. */
export function formatToday(
  date: string,
  arrivals: TodayBrief[],
  departures: TodayBrief[],
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
  scope: MessageScope = 'full',
): string {
  if (scope === 'cleaner') {
    return formatCleanerToday(date, departures, lang);
  }

  const fmtList = (items: TodayBrief[], empty: string): string => {
    if (items.length === 0) return empty;
    return items
      .map((b, i) => {
        const rooms = b.rooms.length
          ? b.rooms.map(escapeHtml).join(', ')
          : tt(lang, 'common.emDash');
        return (
          `${i + 1}. <code>${escapeHtml(b.publicCode)}</code> — ` +
          `${escapeHtml(b.customerName)}, ${escapeHtml(b.phone)}\n` +
          `   ${rooms}`
        );
      })
      .join('\n');
  };

  return [
    `<b>${tt(lang, 'today.title', { date: formatDateRu(date) })}</b>`,
    '',
    `<b>${tt(lang, 'today.arrivals', { count: arrivals.length })}</b>`,
    fmtList(arrivals, tt(lang, 'today.noArrivals')),
    '',
    `<b>${tt(lang, 'today.departures', { count: departures.length })}</b>`,
    fmtList(departures, tt(lang, 'today.noDepartures')),
  ].join('\n');
}

/** Cleaner /today — checkout rooms only, no names/phones/codes/money. */
export function formatCleanerToday(
  date: string,
  departures: TodayBrief[],
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string {
  const rooms = uniqueRoomLabels(departures);
  const lines = [
    `<b>${tt(lang, 'today.cleanerTitle', { date: formatDateRu(date) })}</b>`,
    tt(lang, 'today.cleanerDepartures', { count: rooms.length }),
  ];
  if (rooms.length === 0) {
    lines.push(tt(lang, 'today.noDepartures'));
  } else {
    rooms.forEach((room, i) => {
      lines.push(`${i + 1}. ${escapeHtml(room)}`);
    });
  }
  return lines.join('\n');
}

/** Morning digest — full staff vs cleaner (checkout rooms only). */
export function formatMorningDigest(
  date: string,
  arrivals: TodayBrief[],
  departures: TodayBrief[],
  scope: MessageScope = 'full',
  lang: TelegramLang = DEFAULT_TELEGRAM_LANG,
): string | null {
  if (scope === 'cleaner') {
    const rooms = uniqueRoomLabels(departures);
    const lines = [
      `<b>${tt(lang, 'cleaner.digestTitle', { date: formatDateRu(date) })}</b>`,
    ];
    if (rooms.length === 0) {
      lines.push(tt(lang, 'cleaner.digestNoDepartures'));
    } else {
      lines.push(
        tt(lang, 'cleaner.digestDepartures', { count: rooms.length }),
      );
      rooms.forEach((room, i) => {
        lines.push(`${i + 1}. ${escapeHtml(room)}`);
      });
    }
    return lines.join('\n');
  }

  return formatToday(date, arrivals, departures, lang, 'full');
}

function uniqueRoomLabels(briefs: TodayBrief[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of briefs) {
    for (const room of b.rooms) {
      const key = room.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
