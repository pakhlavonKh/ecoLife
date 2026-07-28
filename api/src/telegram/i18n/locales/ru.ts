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
    phone: 'Телефон',
    room: 'Номер',
    dates: 'Даты',
    deposit: 'Депозит',
    amount: 'Сумма',
    checkOut: 'Выезд',
    reason: 'Причина',
    bookingStatus: 'Статус брони',
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
    notes: 'Заметки',
    totalAmount: 'Итого',
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
  },
  cleaner: {
    freedGeneric: '🧹 Номер освободился.',
    checkoutDate: 'Дата выезда: {{date}}',
    canClean: 'Можно убирать.',
    freedRoom: '🧹 Освободился номер {{number}} ({{cottage}}). Можно убирать.',
  },
  today: {
    title: 'Сегодня {{date}}',
    arrivals: 'Заезды ({{count}})',
    departures: 'Выезды ({{count}})',
    noArrivals: 'Нет заездов',
    noDepartures: 'Нет выездов',
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
