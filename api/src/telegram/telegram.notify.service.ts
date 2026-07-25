import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingStatus } from '@prisma/client';
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
  PAYMENT_RECEIVED_EVENT,
  PaymentReceivedPayload,
} from '../payments/events/payment.events';
import {
  formatBookingCancelled,
  formatBookingEdited,
  formatCheckIn,
  formatCheckOut,
  formatNewBooking,
  formatPaymentReceived,
  formatStatusChanged,
} from './telegram.messages';
import { TelegramQueueService } from './telegram.queue.service';

@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  constructor(private readonly queue: TelegramQueueService) {}

  @OnEvent(BOOKING_CREATED_EVENT, { async: true })
  handleBookingCreated(payload: BookingCreatedPayload): void {
    this.safeEnqueue(formatNewBooking(payload), 'booking.created');
  }

  @OnEvent(BOOKING_UPDATED_EVENT, { async: true })
  handleBookingUpdated(payload: BookingUpdatedPayload): void {
    if (!payload.changes.length) {
      return;
    }
    this.safeEnqueue(
      formatBookingEdited(payload.publicCode, payload.changes),
      'booking.updated',
    );
  }

  @OnEvent(BOOKING_STATUS_CHANGED_EVENT, { async: true })
  handleStatusChanged(payload: BookingStatusChangedPayload): void {
    const { booking, previousStatus, nextStatus } = payload;
    let text: string;
    if (nextStatus === BookingStatus.checked_in) {
      text = formatCheckIn(booking);
    } else if (nextStatus === BookingStatus.checked_out) {
      text = formatCheckOut(booking);
    } else if (nextStatus === BookingStatus.cancelled) {
      text = formatBookingCancelled(booking);
    } else {
      text = formatStatusChanged(booking, previousStatus, nextStatus);
    }
    this.safeEnqueue(text, 'booking.status_changed');
  }

  @OnEvent(BOOKING_HOLD_EXPIRED_EVENT, { async: true })
  handleHoldExpired(payload: BookingHoldExpiredPayload): void {
    this.safeEnqueue(
      formatBookingCancelled(payload, { holdExpired: true }),
      'booking.hold_expired',
    );
  }

  @OnEvent(PAYMENT_RECEIVED_EVENT, { async: true })
  handlePaymentReceived(payload: PaymentReceivedPayload): void {
    this.safeEnqueue(formatPaymentReceived(payload), 'payment.received');
  }

  private safeEnqueue(text: string, event: string): void {
    try {
      if (!this.queue.isReady) {
        return;
      }
      this.queue.enqueueBroadcast(text);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { err: msg, event },
        'Failed to enqueue Telegram notification',
      );
    }
  }
}
