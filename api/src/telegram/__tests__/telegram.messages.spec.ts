import {
  escapeHtml,
  formatBookingCancelled,
  formatBookingEdited,
  formatNewBooking,
  formatPaymentReceived,
  formatToday,
} from '../telegram.messages';
import type { BookingSnapshot } from '../../bookings/events/booking.events';

const sampleBooking: BookingSnapshot = {
  bookingId: 'b1',
  publicCode: 'BK-TEST',
  firstName: 'Ali',
  lastName: 'Karimov',
  phone: '+998901234567',
  rooms: [
    {
      number: '401',
      cottageName: 'Payshanba kottej',
      categoryCode: 'standart',
      categoryName: 'Стандарт',
      capacity: 2,
      bedsBooked: 2,
    },
  ],
  bedsTotal: 2,
  checkIn: '2026-08-01',
  checkOut: '2026-08-03',
  totalAmount: '2000000.00',
  depositAmount: '600000.00',
  paidAmount: '0.00',
  remainingAmount: '2000000.00',
  paymentStatus: 'unpaid',
  status: 'pending_payment',
  source: 'online',
  notes: null,
};

describe('telegram.messages', () => {
  it('escapes HTML entities', () => {
    expect(escapeHtml('a<b>&"c')).toBe('a&lt;b&gt;&amp;&quot;c');
  });

  it('formats new booking in Russian HTML', () => {
    const text = formatNewBooking(sampleBooking);
    expect(text).toContain('<b>Новое бронирование</b>');
    expect(text).toContain('<code>BK-TEST</code>');
    expect(text).toContain('Ali Karimov');
    expect(text).toContain('+998901234567');
    expect(text).toContain('Стандарт');
    expect(text).toContain('Payshanba kottej / 401');
    expect(text).toContain('онлайн');
  });

  it('escapes guest name in new booking', () => {
    const text = formatNewBooking({
      ...sampleBooking,
      firstName: '<script>',
      lastName: 'X',
    });
    expect(text).toContain('&lt;script&gt;');
    expect(text).not.toContain('<script>');
  });

  it('formats payment received', () => {
    const text = formatPaymentReceived({
      bookingId: 'b1',
      paymentId: 'p1',
      publicCode: 'BK-TEST',
      provider: 'cash',
      amount: '600000.00',
      providerTxnId: 'txn-1',
    });
    expect(text).toContain('<b>Оплата получена</b>');
    expect(text).toContain('cash');
    expect(text).toContain('600000.00 UZS');
  });

  it('formats hold-expired cancellation', () => {
    const text = formatBookingCancelled(
      { ...sampleBooking, status: 'cancelled' },
      { holdExpired: true },
    );
    expect(text).toContain('авто-истечение холда');
  });

  it('formats edited fields old → new', () => {
    const text = formatBookingEdited('BK-TEST', [
      { field: 'checkIn', from: '2026-08-01', to: '2026-08-02' },
      { field: 'phone', from: '+998901111111', to: '+998902222222' },
    ]);
    expect(text).toContain('<b>Бронирование изменено</b>');
    expect(text).toContain('Заезд: 2026-08-01 → 2026-08-02');
    expect(text).toContain('Телефон:');
  });

  it('formats /today arrivals and departures', () => {
    const text = formatToday(
      '2026-07-25',
      [
        {
          publicCode: 'BK-IN',
          customerName: 'A B',
          phone: '+99890',
          rooms: ['C / 1'],
          checkIn: '2026-07-25',
          checkOut: '2026-07-26',
          status: 'confirmed',
        },
      ],
      [],
    );
    expect(text).toContain('Сегодня 2026-07-25');
    expect(text).toContain('Заезды (1)');
    expect(text).toContain('BK-IN');
    expect(text).toContain('Нет выездов');
  });
});
