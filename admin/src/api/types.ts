export type User = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager';
  isActive?: boolean;
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: string;
};

export type BookingRoom = {
  bookingRoomId: string;
  roomId: string;
  number: string;
  capacity: number;
  bedsBooked: number;
  cottageId?: string;
  cottageName: string;
  categoryCode: string;
  isActive: boolean;
};

export type Booking = {
  id: string;
  publicCode: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  checkInAt?: string;
  checkOutAt?: string;
  bedsTotal: number;
  priceOriginal: string;
  totalAmount: string;
  depositAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentStatus: string;
  status: string;
  source: string;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  allowedTransitions?: string[];
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  rooms: BookingRoom[];
};

export type Category = {
  id: string;
  code: string;
  name: string;
  description: string;
  depositPercent: number;
  images: string[];
  isActive: boolean;
  /** Price per bed per night (UZS). */
  pricePerBedPerNight: string;
  /** @deprecated bed-mode — kept optional for stale responses */
  priceTiers?: { capacity: number; pricePerNight: string }[];
};

export type Cottage = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  roomsCount?: number;
};

export type Room = {
  id: string;
  number: string;
  capacity: number;
  cottageId: string;
  cottageName: string;
  categoryId: string;
  categoryCode: string;
  priceOverride: string | null;
  tierPrice: string | null;
  resolvedPrice: string | null;
  bookable: boolean;
  isActive: boolean;
};

export type AvailableRoom = {
  id: string;
  number: string;
  capacity: number;
  /** Min free beds across nights in the requested stay (0 if locked). */
  remainingBeds: number;
  categoryCode: string;
  cottageId: string;
  cottageName: string;
  /** Price per bed per night (UZS). */
  pricePerNight: string;
};

export type RoomLock = {
  id: string;
  roomId: string;
  roomNumber: string;
  bookingId: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInAt?: string;
  checkOutAt?: string;
  reason: string | null;
  createdAt?: string;
};

export type DashboardStats = {
  today: string;
  period: { from: string; to: string };
  arrivalsToday: number;
  departuresToday: number;
  activeGuests: number;
  upcomingBookings: number;
  totalBookings: number;
  occupancyPercent: number;
  occupiedBeds: number;
  totalBeds: number;
  revenue: string;
  pendingPayments: number;
  arrivalsList: Array<{
    id: string;
    publicCode: string;
    status: string;
    customerName: string;
    phone: string;
    rooms: string[];
    checkIn: string;
    checkOut: string;
    checkInTime?: string;
    checkOutTime?: string;
    checkInAt?: string;
    checkOutAt?: string;
  }>;
  departuresList: Array<{
    id: string;
    publicCode: string;
    status: string;
    customerName: string;
    phone: string;
    rooms: string[];
    checkIn: string;
    checkOut: string;
    checkInTime?: string;
    checkOutTime?: string;
    checkInAt?: string;
    checkOutAt?: string;
  }>;
};

export type CustomerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  notes: string | null;
  bookingsCount: number;
};

export type CustomerDetail = CustomerListItem & {
  createdAt: string;
  updatedAt: string;
  bookings: Array<{
    id: string;
    publicCode: string;
    checkIn: string;
    checkOut: string;
    status: string;
    paymentStatus: string;
    totalAmount: string;
    depositAmount: string;
    paidAmount: string;
    remainingAmount: string;
    source: string;
    rooms: Array<{ number: string; cottageName: string; categoryCode: string }>;
    payments: Array<{
      id: string;
      provider: string;
      amount: string;
      status: string;
      currency: string;
      createdAt: string;
    }>;
  }>;
};

export type AuditEntry = {
  id: string;
  actorType: string;
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  diff: unknown;
  createdAt: string;
};

export type CalendarData = {
  from: string;
  to: string;
  cleaningBufferMinutes?: number;
  rooms: Array<{
    id: string;
    number: string;
    capacity: number;
    cottageId: string;
    cottageName: string;
    categoryCode: string;
  }>;
  bookings: Array<{
    bookingId: string;
    publicCode: string;
    status: string;
    paymentStatus: string;
    checkIn: string;
    checkOut: string;
    checkInTime?: string;
    checkOutTime?: string;
    checkInAt?: string;
    checkOutAt?: string;
    customerName: string;
    roomId: string;
    roomNumber: string;
    bedsBooked: number;
  }>;
  locks: Array<{
    id: string;
    roomId: string;
    roomNumber: string;
    bookingId: string | null;
    checkIn: string;
    checkOut: string;
    checkInTime?: string;
    checkOutTime?: string;
    checkInAt?: string;
    checkOutAt?: string;
    reason: string | null;
  }>;
};

export type PriceMatrix = {
  matrix: Array<{
    categoryId: string;
    categoryCode: string;
    categoryName: string;
    tiers: Array<{ id: string; capacity: number; pricePerNight: string }>;
  }>;
};

export type TelegramStaffRole = 'owner' | 'admin' | 'manager' | 'cleaner';

export type TelegramRecipient = {
  id: string;
  chatId: string;
  name: string;
  role: TelegramStaffRole;
  language?: 'ru' | 'uz';
  isActive: boolean;
  mutedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramInvite = {
  id: string;
  code: string;
  role: TelegramStaffRole;
  /** Bot username without @ (from getMe / TELEGRAM_BOT_USERNAME). */
  botUsername: string | null;
  /** https://t.me/<bot_username>?start=<CODE> */
  deepLink: string | null;
  createdById: string;
  expiresAt: string;
  usedAt: string | null;
  usedByChatId: string | null;
  createdAt: string;
  isPending: boolean;
};
