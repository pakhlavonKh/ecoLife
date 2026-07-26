import {
  escapeHtml,
  formatBookingCancelled,
  formatBookingEdited,
  formatCheckOut,
  formatCleanerCheckout,
  formatDateRu,
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
      number: '305',
      cottageName: 'Chorshanba kottej',
      categoryCode: 'standart',
      categoryName: 'Стандарт',
      capacity: 9,
      bedsBooked: 9,
    },
  ],
  bedsTotal: 9,
  checkIn: '2026-08-01',
  checkOut: '2026-08-03',
  totalAmount: '2000000.00',
  depositAmount: '600000.00',
  paidAmount: '600000.00',
  remainingAmount: '1400000.00',
  paymentStatus: 'deposit_paid',
  status: 'checked_out',
  source: 'online',
  notes: null,
};

describe('telegram.messages', () => {
  it('escapes HTML entities', () => {
    expect(escapeHtml('a<b>&"c')).toBe('a&lt;b&gt;&amp;&quot;c');
  });

  it('formats dates as DD/MM/YYYY', () => {
    expect(formatDateRu('2026-08-01')).toBe('01/08/2026');
  });

  it('formats compact new booking for admins', () => {
    const text = formatNewBooking(sampleBooking, 'full');
    expect(text).toContain('<b>Новое бронирование</b>');
    expect(text).toContain('<code>BK-TEST</code>');
    expect(text).toContain('Ali Karimov');
    expect(text).toContain('+998901234567');
    expect(text).toContain('Коттедж Среда / 305');
    expect(text).toContain('Даты: 01/08/2026 → 03/08/2026');
    expect(text).toMatch(/Депозит: .*600.?000 UZS/);
    expect(text).not.toContain('Требует ручного подтверждения');
    // No noise fields
    expect(text).not.toContain('Мест:');
    expect(text).not.toContain('Итого:');
    expect(text).not.toContain('Оплачено:');
    expect(text).not.toContain('Остаток:');
    expect(text).not.toContain('Статус:');
  });

  it('formats new booking in uzbek for recipient language', () => {
    const text = formatNewBooking(sampleBooking, 'full', 'uz');
    expect(text).toContain('<b>Yangi bron</b>');
    expect(text).toContain('Mehmon: Ali Karimov');
    expect(text).toContain('Chorshanba kotteji / 305');
    expect(text).toContain('Sanalar:');
  });

  it('marks online_request bookings for manual payment confirmation', () => {
    const text = formatNewBooking({
      ...sampleBooking,
      source: 'online_request',
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      paidAmount: '0.00',
    });
    expect(text).toContain('<b>Новая предзаявка</b>');
    expect(text).toContain('+998901234567');
    expect(text).toContain('⚠️ Требует ручного подтверждения оплаты');
  });

  it('does not duplicate guest name when surname empty or same', () => {
    expect(
      formatNewBooking({ ...sampleBooking, firstName: 'MK', lastName: '' }),
    ).toContain('Гость: MK');
    expect(
      formatNewBooking({ ...sampleBooking, firstName: 'MK', lastName: 'MK' }),
    ).toMatch(/Гость: MK\n/);
    expect(
      formatNewBooking({ ...sampleBooking, firstName: 'MK', lastName: 'MK' }),
    ).not.toContain('MK MK');
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

  it('formats payment received without provider noise', () => {
    const text = formatPaymentReceived(
      {
        bookingId: 'b1',
        paymentId: 'p1',
        publicCode: 'BK-TEST',
        provider: 'cash',
        amount: '600000.00',
        providerTxnId: 'txn-1',
      },
      'full',
    );
    expect(text).toContain('<b>Оплата получена</b>');
    expect(text).toMatch(/600.?000 UZS/);
    expect(text).not.toContain('cash');
    expect(text).not.toContain('Провайдер');
  });

  it('formats hold-expired cancellation', () => {
    const text = formatBookingCancelled(
      { ...sampleBooking, status: 'cancelled' },
      { holdExpired: true, scope: 'full' },
    );
    expect(text).toContain('холд истёк');
    expect(text).not.toContain('Итого:');
  });

  it('formats edited fields old → new with date format', () => {
    const text = formatBookingEdited(
      'BK-TEST',
      [
        { field: 'checkIn', from: '2026-08-01', to: '2026-08-02' },
        { field: 'phone', from: '+998901111111', to: '+998902222222' },
      ],
      'full',
    );
    expect(text).toContain('<b>Бронирование изменено</b>');
    expect(text).toContain('Заезд: 01/08/2026 → 02/08/2026');
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
    expect(text).toContain('Сегодня 25/07/2026');
    expect(text).toContain('Заезды (1)');
    expect(text).toContain('BK-IN');
    expect(text).toContain('Нет выездов');
  });

  describe('cleaner scope privacy (§5 GATE)', () => {
    it('checkout template has cottage + room only — no name/phone/money/code', () => {
      const text = formatCheckOut(sampleBooking, 'cleaner');
      expect(text).toBeTruthy();
      expect(text).toContain('305');
      expect(text).toContain('Chorshanba kottej');
      expect(text).toContain('Можно убирать');

      expect(text).not.toContain('Ali');
      expect(text).not.toContain('Karimov');
      expect(text).not.toContain('+998901234567');
      expect(text).not.toContain('998901234567');
      expect(text).not.toContain('BK-TEST');
      expect(text).not.toContain('2000000');
      expect(text).not.toContain('600000');
      expect(text).not.toContain('1400000');
      expect(text).not.toContain('UZS');
      expect(text).not.toContain('Гость');
      expect(text).not.toContain('Телефон');
      expect(text).not.toContain('Депозит');
      expect(text).not.toContain('Итого');
    });

    it('formatCleanerCheckout matches the §5 example shape', () => {
      const text = formatCleanerCheckout(sampleBooking);
      expect(text).toBe(
        '🧹 Освободился номер 305 (Chorshanba kottej). Можно убирать.',
      );
    });

    it('new booking / payment formatters return null for cleaner', () => {
      expect(formatNewBooking(sampleBooking, 'cleaner')).toBeNull();
      expect(
        formatPaymentReceived(
          {
            bookingId: 'b1',
            paymentId: 'p1',
            publicCode: 'BK-TEST',
            provider: 'mock',
            amount: '1',
            providerTxnId: 't',
          },
          'cleaner',
        ),
      ).toBeNull();
    });
  });
});
