import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingStatus, NotificationEvent } from '@prisma/client';
import {
  BOOKING_CREATED_EVENT,
  BOOKING_HOLD_EXPIRED_EVENT,
  BOOKING_STATUS_CHANGED_EVENT,
  BOOKING_UPDATED_EVENT,
  BookingCreatedPayload,
  BookingHoldExpiredPayload,
  BookingStatusChangedPayload,
  BookingUpdatedPayload,
} from '../bookings/events/booking.events';
import {
  PAYMENT_FAILED_EVENT,
  PAYMENT_LATE_MANUAL_REVIEW_EVENT,
  PAYMENT_RECEIVED_EVENT,
  PaymentFailedPayload,
  PaymentLateManualReviewPayload,
  PaymentReceivedPayload,
} from '../payments/events/payment.events';
import {
  ROOM_LOCK_CREATED_EVENT,
  RoomLockCreatedPayload,
} from '../room-locks/events/room-lock.events';
import type { TelegramLang } from './i18n';
import {
  formatBookingCancelled,
  formatBookingEdited,
  formatCheckIn,
  formatCheckOut,
  formatHoldExpired,
  formatLatePaymentReview,
  formatMorningDigest,
  formatNewBooking,
  formatPaymentFailed,
  formatPaymentReceived,
  formatRoomLocked,
  formatStatusChanged,
  type TodayBrief,
} from './telegram.messages';
import { TelegramQueueService } from './telegram.queue.service';
import { TelegramRouterService } from './telegram.router.service';
import type { MessageScope } from './telegram.routing';

@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  constructor(
    private readonly queue: TelegramQueueService,
    private readonly router: TelegramRouterService,
  ) {}

  @OnEvent(BOOKING_CREATED_EVENT, { async: true })
  handleBookingCreated(payload: BookingCreatedPayload): void {
    void this.dispatch(NotificationEvent.booking_created, (scope, lang) =>
      formatNewBooking(payload, scope, lang),
    );
  }

  @OnEvent(BOOKING_UPDATED_EVENT, { async: true })
  handleBookingUpdated(payload: BookingUpdatedPayload): void {
    if (!payload.changes.length) {
      return;
    }
    void this.dispatch(NotificationEvent.booking_updated, (scope, lang) =>
      formatBookingEdited(payload.publicCode, payload.changes, scope, lang),
    );
  }

  @OnEvent(BOOKING_STATUS_CHANGED_EVENT, { async: true })
  handleStatusChanged(payload: BookingStatusChangedPayload): void {
    const { booking, previousStatus, nextStatus } = payload;

    if (nextStatus === BookingStatus.checked_in) {
      void this.dispatch(NotificationEvent.booking_checked_in, (scope, lang) =>
        formatCheckIn(booking, scope, lang),
      );
      return;
    }
    if (nextStatus === BookingStatus.checked_out) {
      void this.dispatch(
        NotificationEvent.booking_checked_out,
        (scope, lang) => formatCheckOut(booking, scope, lang),
      );
      return;
    }
    if (nextStatus === BookingStatus.cancelled) {
      void this.dispatch(NotificationEvent.booking_cancelled, (scope, lang) =>
        formatBookingCancelled(booking, { scope, lang }),
      );
      return;
    }

    // Other transitions (e.g. deposit_paid → confirmed) → booking.updated matrix.
    void this.dispatch(NotificationEvent.booking_updated, (scope, lang) =>
      formatStatusChanged(booking, previousStatus, nextStatus, scope, lang),
    );
  }

  @OnEvent(BOOKING_HOLD_EXPIRED_EVENT, { async: true })
  handleHoldExpired(payload: BookingHoldExpiredPayload): void {
    void this.dispatch(NotificationEvent.system_hold_expired, (scope, lang) =>
      formatHoldExpired(payload, scope, lang),
    );
  }

  @OnEvent(PAYMENT_RECEIVED_EVENT, { async: true })
  handlePaymentReceived(payload: PaymentReceivedPayload): void {
    void this.dispatch(NotificationEvent.payment_received, (scope, lang) =>
      formatPaymentReceived(payload, scope, lang),
    );
  }

  @OnEvent(PAYMENT_FAILED_EVENT, { async: true })
  handlePaymentFailed(payload: PaymentFailedPayload): void {
    void this.dispatch(
      NotificationEvent.system_payment_failed,
      (scope, lang) => formatPaymentFailed(payload, scope, lang),
    );
  }

  @OnEvent(PAYMENT_LATE_MANUAL_REVIEW_EVENT, { async: true })
  handleLatePaymentReview(payload: PaymentLateManualReviewPayload): void {
    void this.dispatch(
      NotificationEvent.system_late_payment_review,
      (scope, lang) => formatLatePaymentReview(payload, scope, lang),
    );
  }

  @OnEvent(ROOM_LOCK_CREATED_EVENT, { async: true })
  handleRoomLockCreated(payload: RoomLockCreatedPayload): void {
    void this.dispatch(NotificationEvent.system_room_locked, (scope, lang) =>
      formatRoomLocked(payload, scope, lang),
    );
  }

  /** Called by morning digest cron — never throws to the scheduler. */
  sendMorningDigest(
    date: string,
    arrivals: TodayBrief[],
    departures: TodayBrief[],
  ): void {
    void this.dispatch(NotificationEvent.digest_morning, (scope, lang) =>
      formatMorningDigest(date, arrivals, departures, scope, lang),
    );
  }

  private async dispatch(
    event: NotificationEvent,
    format: (scope: MessageScope, lang: TelegramLang) => string | null,
  ): Promise<void> {
    try {
      if (!this.queue.isReady) {
        return;
      }
      const targets = await this.router.resolve(event);
      if (targets.length === 0) {
        return;
      }

      const jobs: Array<{ chatId: string; text: string }> = [];
      for (const t of targets) {
        const text = format(t.scope, t.language);
        if (text) {
          jobs.push({ chatId: t.chatId, text });
        }
      }
      this.queue.enqueueMany(jobs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { err: msg, event },
        'Failed to enqueue Telegram notification',
      );
    }
  }
}
