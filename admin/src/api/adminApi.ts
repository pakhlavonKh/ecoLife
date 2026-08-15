import { api } from './client';
import type {
  AuditEntry,
  Booking,
  CalendarData,
  Category,
  Cottage,
  CustomerDetail,
  CustomerListItem,
  DashboardStats,
  ExtendBookingResult,
  Room,
  RoomLock,
  TelegramInvite,
  TelegramRecipient,
  TelegramStaffRole,
  Tokens,
  TransferBookingResult,
  User,
  AvailableRoom,
} from './types';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: User; tokens: Tokens }>('/api/v1/auth/login', {
      email,
      password,
    }),
  logout: (refreshToken: string) =>
    api.post('/api/v1/auth/logout', { refreshToken }),
  me: () => api.get<User>('/api/v1/admin/users/me'),
};

export const bookingsApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<{ data: Booking[]; total: number; limit: number; offset: number }>(
      '/api/v1/admin/bookings',
      { params },
    ),
  get: (id: string) => api.get<Booking>(`/api/v1/admin/bookings/${id}`),

  createManual: (body: Record<string, unknown>) =>
    api.post<Booking>('/api/v1/admin/bookings', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<Booking>(`/api/v1/admin/bookings/${id}`, body),
  transition: (id: string, status: string) =>
    api.patch<Booking>(`/api/v1/admin/bookings/${id}/status`, { status }),
  cash: (id: string, amount?: string, note?: string) =>
    api.post(`/api/v1/admin/bookings/${id}/payments/cash`, {
      ...(amount ? { amount } : {}),
      ...(note ? { note } : {}),
    }),
  markPayment: (
    id: string,
    provider: 'cash' | 'card' | 'transfer' | 'terminal',
    amount?: string,
    note?: string,
  ) =>
    api.post(`/api/v1/admin/bookings/${id}/payments`, {
      provider,
      ...(amount ? { amount } : {}),
      ...(note ? { note } : {}),
    }),
  transfer: (
    id: string,
    body: {
      roomId: string;
      transferDate: string;
      transferTime?: string;
      surchargeAmount?: number;
      note?: string;
    },
  ) =>
    api.post<TransferBookingResult>(
      `/api/v1/admin/bookings/${id}/transfer`,
      body,
    ),
  extend: (
    id: string,
    body: {
      newCheckOut: string;
      newCheckOutTime?: string;
      addedAmount?: number;
      offerCategoryCode?: string;
      transferToRoomId?: string;
      note?: string;
    },
  ) =>
    api.post<ExtendBookingResult>(
      `/api/v1/admin/bookings/${id}/extend`,
      body,
    ),
  delete: (id: string) => api.delete<{ success: boolean; id: string }>(`/api/v1/admin/bookings/${id}`),
};

export const availabilityApi = {
  admin: (
    check_in: string,
    check_out: string,
    opts?: {
      excludeBookingId?: string;
      checkInTime?: string;
      checkOutTime?: string;
    },
  ) =>
    api.get<{
      nights: number;
      cleaningBufferMinutes?: number;
      checkInTime?: string;
      checkOutTime?: string;
      categories: Array<{
        code: string;
        name: string;
        depositPercent: number;
        availableRooms?: AvailableRoom[];
      }>;
    }>('/api/v1/admin/availability', {
      params: {
        check_in,
        check_out,
        ...(opts?.checkInTime ? { check_in_time: opts.checkInTime } : {}),
        ...(opts?.checkOutTime ? { check_out_time: opts.checkOutTime } : {}),
        ...(opts?.excludeBookingId
          ? { exclude_booking_id: opts.excludeBookingId }
          : {}),
      },
    }),
};

export const roomLocksApi = {
  list: (params?: {
    from?: string;
    to?: string;
    roomId?: string;
    bookingId?: string;
  }) => api.get<RoomLock[]>('/api/v1/admin/room-locks', { params }),
  create: (body: {
    roomId: string;
    checkIn: string;
    checkOut: string;
    checkInTime?: string;
    checkOutTime?: string;
    reason?: string;
    bookingId?: string;
  }) => api.post<RoomLock>('/api/v1/admin/room-locks', body),
};

export const dashboardApi = {
  get: (from?: string, to?: string) =>
    api.get<DashboardStats>('/api/v1/admin/dashboard', {
      params: { from, to },
    }),
};

export const exportsApi = {
  mealForecast: (params: {
    from: string;
    to: string;
    format: 'xlsx' | 'pdf';
    includePending?: boolean;
  }) =>
    api.get<Blob>('/api/v1/admin/exports/meal-forecast', {
      params: {
        from: params.from,
        to: params.to,
        format: params.format,
        ...(params.includePending ? { include_pending: 'true' } : {}),
      },
      responseType: 'blob',
    }),
};

export const customersApi = {
  list: (search?: string) =>
    api.get<CustomerListItem[]>('/api/v1/admin/customers', {
      params: { search },
    }),
  get: (id: string) =>
    api.get<CustomerDetail>(`/api/v1/admin/customers/${id}`),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<CustomerDetail>(`/api/v1/admin/customers/${id}`, body),
};

export const inventoryApi = {
  categories: () => api.get<Category[]>('/api/v1/admin/categories'),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    api.patch<Category>(`/api/v1/admin/categories/${id}`, body),
  cottages: () => api.get<Cottage[]>('/api/v1/admin/cottages'),
  rooms: (params?: { cottageId?: string; categoryId?: string }) =>
    api.get<Room[]>('/api/v1/admin/rooms', { params }),
  updateRoom: (id: string, body: Record<string, unknown>) =>
    api.patch<Room>(`/api/v1/admin/rooms/${id}`, body),
};

export const calendarApi = {
  get: (from: string, to: string) =>
    api.get<CalendarData>('/api/v1/admin/calendar', { params: { from, to } }),
};

export const auditApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<AuditEntry[]>('/api/v1/admin/audit-log', { params }),
  delete: (id: string) => api.delete(`/api/v1/admin/audit-log/${id}`),
  clearAll: () => api.delete('/api/v1/admin/audit-log'),
};

export const telegramApi = {
  recipients: () =>
    api.get<TelegramRecipient[]>('/api/v1/admin/telegram/recipients'),
  updateRecipient: (id: string, body: Record<string, unknown>) =>
    api.patch<TelegramRecipient>(
      `/api/v1/admin/telegram/recipients/${id}`,
      body,
    ),
  deleteRecipient: (id: string) =>
    api.delete(`/api/v1/admin/telegram/recipients/${id}`),
  invites: (pending?: boolean) =>
    api.get<TelegramInvite[]>('/api/v1/admin/telegram/invites', {
      params: pending ? { pending: 'true' } : undefined,
    }),
  createInvite: (role: TelegramStaffRole) =>
    api.post<TelegramInvite>('/api/v1/admin/telegram/invites', { role }),
  revokeInvite: (id: string) =>
    api.delete(`/api/v1/admin/telegram/invites/${id}`),
};
