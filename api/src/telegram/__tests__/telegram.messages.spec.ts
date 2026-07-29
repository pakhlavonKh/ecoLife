import {
  escapeHtml,
  formatBookingCancelled,
  formatBookingEdited,
  formatCheckOut,
  formatCleanerCheckout,
  formatCleanerToday,
  formatDateRu,
  formatMorningDigest,
  formatNewBooking,
  formatOwnerStats,
  formatPaymentReceived,
  formatRoomLocked,
  formatStatsPeriodLabel,
  formatToday,
} from '../telegram.messages';
import type { BookingSnapshot } from '../../bookings/events/booking.events';
import {
  parseCustomStatsRange,
  resolveStatsPresetRange,
} from '../stats-period';

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
      bedsBooked: 2,
    },
  ],
  bedsTotal: 2,
  adults: 2,
  children: 0,
  infants: 0,
  checkIn: '2026-08-01',
  checkOut: '2026-08-03',
  checkInTime: '14:00',
  checkOutTime: '12:00',
  priceOriginal: '1200000.00',
  totalAmount: '1200000.00',
  depositAmount: '360000.00',
  paidAmount: '360000.00',
  remainingAmount: '840000.00',
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

  it('formats compact new booking for admins with bed-mode guests + occupancy', () => {
    const text = formatNewBooking(sampleBooking, 'full', 'ru');
    expect(text).toContain('<b>Новое бронирование</b>');
    expect(text).toContain('<code>BK-TEST</code>');
    expect(text).toContain('Ali Karimov');
    expect(text).toContain('+998901234567');
    expect(text).toContain('Гости: 2');
    expect(text).toContain('Коттедж Среда / 305');
    expect(text).toContain('Мест в номере: 2/9 занято');
    expect(text).toContain('Даты: 01/08/2026 14:00 → 03/08/2026 12:00');
    expect(text).toMatch(/Общая сумма: .*1.?200.?000 UZS/);
    expect(text).not.toContain('Требует ручного подтверждения');
    // No noise money/status fields beyond total
    expect(text).not.toContain('Депозит:');
    expect(text).not.toContain('Оплачено:');
    expect(text).not.toContain('Остаток:');
    expect(text).not.toContain('Статус:');
  });

  it('formats new booking in uzbek for recipient language', () => {
    const text = formatNewBooking(sampleBooking, 'full', 'uz');
    expect(text).toContain('<b>Yangi bron</b>');
    expect(text).toContain('Mehmon: Ali Karimov');
    expect(text).toContain('Mehmonlar: 2');
    expect(text).toContain('Chorshanba kotteji / 305');
    expect(text).toContain('Xonada joylar: 2/9 band');
    expect(text).toContain('Sanalar:');
    expect(text).toMatch(/Umumiy summa: .*1.?200.?000 UZS/);
    expect(text).not.toContain('Depozit:');
  });

  it('marks online_request bookings for manual payment confirmation', () => {
    const text = formatNewBooking(
      {
        ...sampleBooking,
        source: 'online_request',
        status: 'pending_payment',
        paymentStatus: 'unpaid',
        paidAmount: '0.00',
      },
      'full',
      'ru',
    );
    expect(text).toContain('<b>Новая предзаявка</b>');
    expect(text).toContain('+998901234567');
    expect(text).toContain('⚠️ Требует ручного подтверждения оплаты');
  });

  it('does not duplicate guest name when surname empty or same', () => {
    expect(
      formatNewBooking(
        { ...sampleBooking, firstName: 'MK', lastName: '' },
        'full',
        'ru',
      ),
    ).toContain('Гость: MK');
    expect(
      formatNewBooking(
        { ...sampleBooking, firstName: 'MK', lastName: 'MK' },
        'full',
        'ru',
      ),
    ).toMatch(/Гость: MK\n/);
    expect(
      formatNewBooking(
        { ...sampleBooking, firstName: 'MK', lastName: 'MK' },
        'full',
        'ru',
      ),
    ).not.toContain('MK MK');
  });

  it('escapes guest name in new booking', () => {
    const text = formatNewBooking(
      {
        ...sampleBooking,
        firstName: '<script>',
        lastName: 'X',
      },
      'full',
      'ru',
    );
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
      'ru',
    );
    expect(text).toContain('<b>Оплата получена</b>');
    expect(text).toMatch(/600.?000 UZS/);
    expect(text).not.toContain('cash');
    expect(text).not.toContain('Провайдер');
    expect(text).not.toContain('Сумма скорректирована');
  });

  it('adds bargain line when total differs from price_original', () => {
    const text = formatPaymentReceived(
      {
        bookingId: 'b1',
        paymentId: 'p1',
        publicCode: 'BK-TEST',
        provider: 'cash',
        amount: '550000.00',
        providerTxnId: 'txn-2',
        priceAdjustment: {
          priceOriginal: '1000000.00',
          totalAmount: '850000.00',
          depositAmount: '300000.00',
          remainingAmount: '550000.00',
        },
      },
      'full',
      'ru',
    );
    expect(text).toContain('<b>Оплата получена</b>');
    expect(text).toMatch(/550.?000 UZS/);
    expect(text).toMatch(
      /Сумма скорректирована: 1.?000.?000 → 850.?000 UZS \(депозит 300.?000 оплачен, остаток 550.?000\)/,
    );
  });

  it('formats hold-expired cancellation', () => {
    const text = formatBookingCancelled(
      { ...sampleBooking, status: 'cancelled' },
      { holdExpired: true, scope: 'full', lang: 'ru' },
    );
    expect(text).toContain('холд истёк');
    expect(text).toContain('Гости: 2');
    expect(text).toContain('Мест в номере: 2/9 занято');
    expect(text).not.toContain('Итого:');
  });

  it('formats edited fields old → new with date and time format', () => {
    const text = formatBookingEdited(
      'BK-TEST',
      [
        { field: 'checkIn', from: '2026-08-01', to: '2026-08-02' },
        { field: 'checkInTime', from: '14:00', to: '16:00' },
        { field: 'phone', from: '+998901111111', to: '+998902222222' },
      ],
      'full',
      'ru',
    );
    expect(text).toContain('<b>Бронирование изменено</b>');
    expect(text).toContain('Заезд: 01/08/2026 → 02/08/2026');
    expect(text).toContain('Время заезда: 14:00 → 16:00');
    expect(text).toContain('Телефон:');
  });

  it('formats whole-room lock alert', () => {
    const text = formatRoomLocked(
      {
        lockId: 'l1',
        roomId: 'r1',
        roomNumber: '305',
        cottageName: 'Chorshanba kottej',
        checkIn: '2026-08-01',
        checkOut: '2026-08-05',
        checkInTime: '14:00',
        checkOutTime: '12:00',
        reason: 'группа',
        bookingId: null,
      },
      'full',
      'ru',
    );
    expect(text).toContain('Номер 305 закрыт целиком на 01.08 14:00–05.08 12:00');
    expect(text).toContain('Коттедж Среда / 305');
    expect(text).toContain('группа');
    expect(formatRoomLocked(
      {
        lockId: 'l1',
        roomId: 'r1',
        roomNumber: '305',
        cottageName: 'Chorshanba kottej',
        checkIn: '2026-08-01',
        checkOut: '2026-08-05',
        checkInTime: '14:00',
        checkOutTime: '12:00',
        reason: null,
        bookingId: null,
      },
      'cleaner',
      'ru',
    )).toBeNull();
  });

  it('formats /today arrivals and departures with times', () => {
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
          checkInTime: '14:00',
          checkOutTime: '12:00',
          status: 'confirmed',
        },
      ],
      [],
      'ru',
    );
    expect(text).toContain('Сегодня 25/07/2026');
    expect(text).toContain('Заезды (1)');
    expect(text).toContain('BK-IN');
    expect(text).toContain('C / 1 · 14:00');
    expect(text).toContain('Нет выездов');
  });

  describe('cleaner scope privacy (§5 GATE)', () => {
    it('checkout template has cottage + room + time only — no name/phone/money/code', () => {
      const text = formatCheckOut(sampleBooking, 'cleaner', 'ru');
      expect(text).toBeTruthy();
      expect(text).toContain('305');
      expect(text).toContain('Chorshanba kottej');
      expect(text).toContain('Выезд 03/08/2026 12:00');
      expect(text).toContain('Можно убирать');

      expect(text).not.toContain('Ali');
      expect(text).not.toContain('Karimov');
      expect(text).not.toContain('+998901234567');
      expect(text).not.toContain('998901234567');
      expect(text).not.toContain('BK-TEST');
      expect(text).not.toContain('1200000');
      expect(text).not.toContain('360000');
      expect(text).not.toContain('840000');
      expect(text).not.toContain('UZS');
      expect(text).not.toContain('Гость');
      expect(text).not.toContain('Телефон');
      expect(text).not.toContain('Депозит');
      expect(text).not.toContain('Итого');
    });

    it('formatCleanerCheckout matches the §5 example shape with time', () => {
      const text = formatCleanerCheckout(sampleBooking, 'ru');
      expect(text).toBe(
        '🧹 Освободился номер 305 (Chorshanba kottej). Выезд 03/08/2026 12:00. Можно убирать.',
      );
    });

    it('new booking / payment formatters return null for cleaner', () => {
      expect(formatNewBooking(sampleBooking, 'cleaner', 'ru')).toBeNull();
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
          'ru',
        ),
      ).toBeNull();
    });

    it('/today and morning digest for cleaner — room + time only, no PII/money', () => {
      const departures = [
        {
          publicCode: 'BK-OUT',
          customerName: 'Secret Guest',
          phone: '+998901111111',
          rooms: ['Chorshanba kottej / 305'],
          checkIn: '2026-07-24',
          checkOut: '2026-07-25',
          checkInTime: '14:00',
          checkOutTime: '12:00',
          status: 'checked_in',
        },
      ];
      const today = formatCleanerToday('2026-07-25', departures, 'ru');
      expect(today).toContain('Выезды сегодня 25/07/2026');
      expect(today).toContain('Chorshanba kottej / 305 · 12:00');
      expect(today).not.toContain('Secret');
      expect(today).not.toContain('BK-OUT');
      expect(today).not.toContain('998901111111');
      expect(today).not.toContain('UZS');

      const digest = formatMorningDigest(
        '2026-07-25',
        [],
        departures,
        'cleaner',
        'ru',
      );
      expect(digest).toContain('Утренняя сводка');
      expect(digest).toContain('Chorshanba kottej / 305 · 12:00');
      expect(digest).not.toContain('Secret');
      expect(digest).not.toContain('BK-OUT');
      expect(digest).not.toContain('998901111111');
    });
  });

  describe('owner /stats', () => {
    it('formats day / week / month / custom period labels (ru)', () => {
      expect(formatStatsPeriodLabel('2026-07-29', '2026-07-29', 'ru')).toBe(
        'за 29 июля 2026',
      );
      expect(formatStatsPeriodLabel('2026-07-23', '2026-07-29', 'ru')).toBe(
        'за 23–29 июля 2026',
      );
      expect(formatStatsPeriodLabel('2026-07-01', '2026-07-31', 'ru')).toBe(
        'за 1–31 июля 2026',
      );
      expect(formatStatsPeriodLabel('2026-08-01', '2026-08-07', 'ru')).toBe(
        'за 1–7 августа 2026',
      );
    });

    it('formats compact cash-in report and hides zero methods', () => {
      const day = formatOwnerStats(
        {
          period: { from: '2026-07-29', to: '2026-07-29' },
          arrivalsBookings: 3,
          arrivalsGuests: 8,
          departures: 2,
          stayingGuests: 18,
          paymentsByProvider: {
            cash: '4500000',
            transfer: '1200000',
            click: '0',
          },
          revenue: '5700000',
        },
        'ru',
      );

      expect(day).toContain('📊 Отчёт за 29 июля 2026');
      expect(day).toContain('Заезды: 8 гостей');
      expect(day).toContain('Выезды: 2');
      expect(day).toContain('Сейчас проживает: 18 гостей');
      expect(day).toContain('💳 Оплаты:');
      expect(day).toMatch(/Наличные: 4.?500.?000/);
      expect(day).toMatch(/Перечисление: 1.?200.?000/);
      expect(day).not.toContain('Click:');
      expect(day).not.toContain('Payme:');
      expect(day).toMatch(/💰 Всего: 5.?700.?000 UZS/);

      const week = formatOwnerStats(
        {
          period: { from: '2026-07-23', to: '2026-07-29' },
          arrivalsBookings: 12,
          arrivalsGuests: 34,
          departures: 9,
          stayingGuests: 18,
          paymentsByProvider: { cash: '4500000', transfer: '1200000' },
          revenue: '5700000',
        },
        'ru',
      );
      expect(week).toContain('📊 Отчёт за 23–29 июля 2026');
      expect(week).toContain('Заезды: 34 гостей');

      const month = formatOwnerStats(
        {
          period: { from: '2026-07-01', to: '2026-07-31' },
          arrivalsBookings: 40,
          arrivalsGuests: 110,
          departures: 35,
          stayingGuests: 18,
          paymentsByProvider: {
            click: '2000000',
            payme: '1500000',
            cash: '3000000',
          },
          revenue: '6500000',
        },
        'ru',
      );
      expect(month).toContain('📊 Отчёт за 1–31 июля 2026');
      expect(month).toMatch(/Click: 2.?000.?000/);
      expect(month).toMatch(/Payme: 1.?500.?000/);
      expect(month).toMatch(/Наличные: 3.?000.?000/);

      const custom = formatOwnerStats(
        {
          period: { from: '2026-08-01', to: '2026-08-07' },
          arrivalsBookings: 12,
          arrivalsGuests: 34,
          departures: 9,
          stayingGuests: 18,
          paymentsByProvider: {
            cash: '4500000',
            transfer: '1200000',
          },
          revenue: '5700000',
        },
        'ru',
      );
      expect(custom).toContain('📊 Отчёт за 1–7 августа 2026');
      expect(custom).toContain('Заезды: 34 гостей');
      expect(custom).toContain('Выезды: 9');
      expect(custom).toContain('Сейчас проживает: 18 гостей');
      expect(custom).toMatch(/Наличные: 4.?500.?000/);
      expect(custom).toMatch(/Перечисление: 1.?200.?000/);
      expect(custom).toMatch(/💰 Всего: 5.?700.?000 UZS/);
    });

    it('formats uz locale report', () => {
      const text = formatOwnerStats(
        {
          period: { from: '2026-08-01', to: '2026-08-07' },
          arrivalsBookings: 12,
          arrivalsGuests: 34,
          departures: 9,
          stayingGuests: 18,
          paymentsByProvider: { cash: '4500000' },
          revenue: '4500000',
        },
        'uz',
      );
      expect(text).toContain('📊 Hisobot');
      expect(text).toContain('Kelishlar: 34 mehmon');
      expect(text).toContain('Naqd:');
    });
  });

  describe('stats period helpers', () => {
    it('resolves day / week / month presets', () => {
      const now = new Date('2026-07-29T10:00:00+05:00');
      expect(resolveStatsPresetRange('day', now)).toEqual({
        from: '2026-07-29',
        to: '2026-07-29',
      });
      expect(resolveStatsPresetRange('week', now)).toEqual({
        from: '2026-07-23',
        to: '2026-07-29',
      });
      expect(resolveStatsPresetRange('month', now)).toEqual({
        from: '2026-07-01',
        to: '2026-07-31',
      });
    });

    it('parses custom DD.MM.YYYY ranges and rejects invalid', () => {
      expect(parseCustomStatsRange('01.08.2026-07.08.2026')).toEqual({
        from: '2026-08-01',
        to: '2026-08-07',
      });
      expect(parseCustomStatsRange('01.08.2026 – 07.08.2026')).toEqual({
        from: '2026-08-01',
        to: '2026-08-07',
      });
      expect(parseCustomStatsRange('07.08.2026-01.08.2026')).toBeNull();
      expect(parseCustomStatsRange('32.08.2026-07.08.2026')).toBeNull();
      expect(parseCustomStatsRange('not-a-range')).toBeNull();
    });
  });
});
