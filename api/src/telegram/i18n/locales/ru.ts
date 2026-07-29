type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? DeepStringRecord<T[K]>
      : T[K];
};

const ruSource = {
  common: {
    emDash: '—',
    code: 'Код',
    guest: 'Гость',
    guests: 'Гости',
    phone: 'Телефон',
    room: 'Номер',
    dates: 'Даты',
    deposit: 'Депозит',
    amount: 'Сумма',
    checkOut: 'Выезд',
    reason: 'Причина',
    bookingStatus: 'Статус брони',
    bedsInRoom: 'Мест в номере: {{booked}}/{{capacity}} занято',
    active: 'активен',
    name: 'Имя',
    role: 'Роль',
    status: 'Статус',
    language: 'Язык',
    mutedUntil: 'Пауза уведомлений до',
  },
  cottages: {
    'Seshanba kottej': 'Коттедж Вторник',
    'Chorshanba kottej': 'Коттедж Среда',
    'Payshanba kottej': 'Коттедж Четверг',
    'Juma kottej': 'Коттедж Пятница',
    'Shanba kottej': 'Коттедж Суббота',
    'Yakshanba kottej': 'Коттедж Воскресенье',
  },
  fields: {
    firstName: 'Имя',
    lastName: 'Фамилия',
    phone: 'Телефон',
    roomNumber: 'Номер',
    cottageName: 'Коттедж',
    category: 'Категория',
    checkIn: 'Заезд',
    checkOut: 'Выезд',
    checkInTime: 'Время заезда',
    checkOutTime: 'Время выезда',
    notes: 'Заметки',
    totalAmount: 'Общая сумма',
    priceOriginal: 'Цена с сайта',
    depositAmount: 'Депозит',
    paymentStatus: 'Оплата',
    bedsTotal: 'Мест',
    status: 'Статус',
    paidAmount: 'Оплачено',
    remainingAmount: 'Остаток',
  },
  roles: {
    owner: 'владелец',
    admin: 'администратор',
    manager: 'менеджер',
    cleaner: 'уборщица',
  },
  events: {
    newBooking: 'Новое бронирование',
    newRequest: 'Новая предзаявка',
    requestNeedsConfirm: '⚠️ Требует ручного подтверждения оплаты',
    paymentReceived: 'Оплата получена',
    paymentAmountAdjusted:
      'Сумма скорректирована: {{from}} → {{to}} UZS (депозит {{deposit}} оплачен, остаток {{remaining}})',
    checkIn: 'Заезд',
    checkOut: 'Выезд',
    cancelled: 'Бронирование отменено',
    cancelledHoldSuffix: '(холд истёк)',
    holdExpired: 'Холд истёк',
    statusChanged: 'Статус изменён',
    bookingEdited: 'Бронирование изменено',
    paymentFailed: 'Оплата не прошла',
    paymentFailedHint:
      'Свяжитесь с гостем или проверьте у провайдера.',
    latePaymentReview: 'Поздняя оплата — проверка',
    roomLocked: 'Номер {{number}} закрыт целиком на {{from}}–{{to}}',
  },
  cleaner: {
    freedGeneric: '🧹 Номер освободился.',
    checkoutDate: 'Выезд: {{date}}',
    canClean: 'Можно убирать.',
    freedRoom:
      '🧹 Освободился номер {{number}} ({{cottage}}). Выезд {{datetime}}. Можно убирать.',
    digestTitle: 'Утренняя сводка {{date}}',
    digestDepartures: 'Сегодня освобождаются ({{count}}):',
    digestNoDepartures: 'Сегодня выездов нет.',
  },
  today: {
    title: 'Сегодня {{date}}',
    arrivals: 'Заезды ({{count}})',
    departures: 'Выезды ({{count}})',
    noArrivals: 'Нет заездов',
    noDepartures: 'Нет выездов',
    cleanerTitle: 'Выезды сегодня {{date}}',
    cleanerDepartures: 'Освобождаются ({{count}}):',
  },
  stats: {
    title: '📊 Отчёт {{period}}',
    prompt: 'Выберите период для отчёта:',
    arrivals: 'Заезды: {{guests}} гостей',
    departures: 'Выезды: {{count}}',
    staying: 'Сейчас проживает: {{guests}} гостей',
    paymentsTitle: '💳 Оплаты:',
    noPayments: 'Оплат за период нет',
    total: '💰 Всего: {{amount}} UZS',
    customPrompt:
      'Введите период в формате ДД.ММ.ГГГГ-ДД.ММ.ГГГГ\nНапример: 01.08.2026-07.08.2026',
    customInvalid:
      'Неверный формат или даты. Введите ДД.ММ.ГГГГ-ДД.ММ.ГГГГ (дата начала ≤ дате конца).',
    buttonDay: 'День',
    buttonWeek: 'Неделя',
    buttonMonth: 'Месяц',
    buttonCustom: 'Свой период',
    periodDay: 'за {{day}} {{month}} {{year}}',
    periodRangeSameMonth: 'за {{fromDay}}–{{toDay}} {{month}} {{year}}',
    periodRange:
      'за {{fromDay}} {{fromMonth}} – {{toDay}} {{toMonth}} {{year}}',
    periodRangeYears:
      'за {{fromDay}} {{fromMonth}} {{fromYear}} – {{toDay}} {{toMonth}} {{toYear}}',
    methodClick: 'Click',
    methodPayme: 'Payme',
    methodCash: 'Наличные',
    methodCard: 'Карта',
    methodTransfer: 'Перечисление',
    methodTerminal: 'Терминал',
    methodMock: 'Mock',
    months: {
      m1: 'января',
      m2: 'февраля',
      m3: 'марта',
      m4: 'апреля',
      m5: 'мая',
      m6: 'июня',
      m7: 'июля',
      m8: 'августа',
      m9: 'сентября',
      m10: 'октября',
      m11: 'ноября',
      m12: 'декабря',
    },
  },
  commands: {
    startStaffOnly:
      'Этот бот для сотрудников EcoLife. Попросите код приглашения у администратора.',
    roleUpdated: 'Роль обновлена.',
    inviteFailed:
      'Не удалось активировать код. Попробуйте позже или попросите новый у администратора.',
    whoamiNotLinked:
      'Вы не подключены. Откройте ссылку-приглашение или отправьте /start КОД.',
    accessDisabled: 'Доступ отключён. Обратитесь к администратору.',
    todayFailed: 'Не удалось получить данные. Попробуйте позже.',
    statsForbidden:
      'Команда /stats доступна только владельцу.',
    statsFailed: 'Не удалось получить статистику. Попробуйте позже.',
    connectedAs: 'Вы подключены как {{role}}.',
    langPrompt: 'Выберите язык / Tilni tanlang:',
    langSaved: 'Язык сохранён: {{language}}',
    langButtonRu: 'Русский',
    langButtonUz: "Oʻzbekcha",
    langCurrent: 'Текущий язык: {{language}}',
  },
  langNames: {
    ru: 'Русский',
    uz: "Oʻzbekcha",
  },
} as const;

export type TelegramDict = DeepStringRecord<typeof ruSource>;
export const ru: TelegramDict = ruSource;
