import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActorType,
  BookingStatus,
  PaymentProvider as PrismaPaymentProvider,
  PaymentRecordStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { decimalToString, toDecimal } from '../common/utils/money';
import { randomUUID } from 'crypto';
import {
  PAYMENT_FAILED_EVENT,
  PAYMENT_LATE_MANUAL_REVIEW_EVENT,
  PAYMENT_RECEIVED_EVENT,
  PaymentFailedPayload,
  PaymentLateManualReviewPayload,
  PaymentReceivedPayload,
} from './events/payment.events';
import {
  NormalizedWebhookEvent,
  PaymentProvider,
  PaymentProviderName,
  ProviderWebhookContext,
  ProviderWebhookResult,
} from './payment-provider.interface';
import { ClickProvider } from './providers/click.provider';
import { MockProvider } from './providers/mock.provider';
import { PaymeProvider } from './providers/payme.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly mock: MockProvider,
    private readonly payme: PaymeProvider,
    private readonly click: ClickProvider,
  ) {}

  enabledProviders(): PaymentProviderName[] {
    const raw = this.config.get<string>('PAYMENT_PROVIDERS') ?? 'mock';
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is PaymentProviderName =>
        s === 'mock' || s === 'payme' || s === 'click',
      );
  }

  resolveProviderName(requested?: string): PaymentProviderName {
    const enabled = this.enabledProviders();
    if (enabled.length === 0) {
      throw new BadRequestException('No payment providers enabled');
    }
    if (!requested) {
      return enabled.includes('mock') ? 'mock' : enabled[0];
    }
    const name = requested.toLowerCase() as PaymentProviderName;
    if (!enabled.includes(name)) {
      throw new BadRequestException(
        `Payment provider "${requested}" is not enabled. Allowed: ${enabled.join(', ')}`,
      );
    }
    return name;
  }

  getProvider(name: PaymentProviderName): PaymentProvider {
    switch (name) {
      case 'mock':
        return this.mock;
      case 'payme':
        return this.payme;
      case 'click':
        return this.click;
      default:
        throw new BadRequestException(`Unknown payment provider: ${name}`);
    }
  }

  /**
   * Create a deposit invoice for a booking and return the checkout URL.
   * Amount is always booking.depositAmount (server-side).
   */
  async createInvoiceForBooking(
    bookingId: string,
    providerName?: string,
  ): Promise<{
    paymentId: string;
    paymentUrl: string;
    provider: PaymentProviderName;
    invoiceId: string;
    amount: string;
  }> {
    const name = this.resolveProviderName(providerName);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.pending_payment) {
      throw new BadRequestException(
        'Invoice can only be created for pending_payment bookings',
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: name as PrismaPaymentProvider,
        amount: booking.depositAmount,
        currency: 'UZS',
        status: PaymentRecordStatus.created,
        payload: { purpose: 'deposit' },
      },
    });

    const provider = this.getProvider(name);
    const invoice = await provider.createInvoice(
      {
        id: booking.id,
        publicCode: booking.publicCode,
        depositAmount: booking.depositAmount,
        expiresAt: booking.expiresAt,
        status: booking.status,
      },
      payment.id,
    );

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentRecordStatus.pending,
        // Mock uses payment id as txn id immediately; Payme/Click set it on webhook.
        providerTxnId: name === 'mock' ? payment.id : null,
        payload: {
          purpose: 'deposit',
          invoiceUrl: invoice.url,
          invoiceId: invoice.invoiceId,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: ActorType.customer,
        actorId: booking.customerId,
        entity: 'payment',
        entityId: payment.id,
        action: 'create_invoice',
        diff: {
          after: {
            provider: name,
            amount: decimalToString(booking.depositAmount),
            invoiceUrl: invoice.url,
          },
        },
      },
    });

    return {
      paymentId: updated.id,
      paymentUrl: invoice.url,
      provider: name,
      invoiceId: invoice.invoiceId,
      amount: decimalToString(booking.depositAmount),
    };
  }

  /**
   * Admin offline cash payment. Adds to paid_amount; sets paid_full when complete.
   * If booking is still pending_payment and cash covers deposit → deposit_paid.
   */
  async recordCashPayment(
    bookingId: string,
    amountStr: string | undefined,
    actor: { type: ActorType; id: string; note?: string },
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        bookingRooms: {
          include: {
            room: { include: { cottage: true, category: true } },
          },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (
      booking.status === BookingStatus.cancelled ||
      booking.status === BookingStatus.checked_out
    ) {
      throw new BadRequestException(
        `Cannot record payment for booking in status ${booking.status}`,
      );
    }

    const remaining = booking.remainingAmount;
    if (remaining.lte(0)) {
      throw new BadRequestException('Booking is already fully paid');
    }

    const amount = amountStr ? toDecimal(amountStr) : remaining;
    if (amount.lte(0)) {
      throw new BadRequestException('amount must be positive');
    }
    if (amount.gt(remaining)) {
      throw new BadRequestException(
        `amount exceeds remaining balance (${decimalToString(remaining)})`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const paidAmount = booking.paidAmount.add(amount);
      const remainingAmount = booking.totalAmount.sub(paidAmount);

      let paymentStatus: PaymentStatus;
      if (paidAmount.gte(booking.totalAmount)) {
        paymentStatus = PaymentStatus.paid_full;
      } else if (paidAmount.gte(booking.depositAmount)) {
        paymentStatus = PaymentStatus.deposit_paid;
      } else {
        paymentStatus = PaymentStatus.unpaid;
      }

      let status = booking.status;
      if (
        booking.status === BookingStatus.pending_payment &&
        paidAmount.gte(booking.depositAmount)
      ) {
        status = BookingStatus.deposit_paid;
      }

      const payment = await tx.payment.create({
        data: {
          bookingId,
          provider: PrismaPaymentProvider.cash,
          providerTxnId: `cash-${randomUUID()}`,
          amount,
          currency: 'UZS',
          status: PaymentRecordStatus.succeeded,
          payload: {
            purpose: 'admin_cash',
            note: actor.note ?? null,
            recordedBy: actor.id,
          },
        },
      });

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          paidAmount,
          remainingAmount: remainingAmount.lt(0)
            ? new Decimal(0)
            : remainingAmount,
          paymentStatus,
          status,
          ...(status !== BookingStatus.pending_payment
            ? { expiresAt: null }
            : {}),
        },
        include: {
          customer: true,
          bookingRooms: {
            include: {
              room: { include: { cottage: true, category: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: actor.type,
          actorId: actor.id,
          entity: 'payment',
          entityId: payment.id,
          action: 'cash_received',
          diff: {
            before: {
              paidAmount: decimalToString(booking.paidAmount),
              paymentStatus: booking.paymentStatus,
              status: booking.status,
            },
            after: {
              paidAmount: decimalToString(paidAmount),
              paymentStatus,
              status,
              amount: decimalToString(amount),
              note: actor.note ?? null,
            },
          },
        },
      });

      return { payment, booking: updated };
    });

    const received: PaymentReceivedPayload = {
      bookingId,
      paymentId: result.payment.id,
      publicCode: booking.publicCode,
      provider: 'cash',
      amount: decimalToString(amount),
      providerTxnId: result.payment.providerTxnId ?? '',
    };
    this.events.emit(PAYMENT_RECEIVED_EVENT, received);

    return {
      payment: {
        id: result.payment.id,
        provider: result.payment.provider,
        amount: decimalToString(result.payment.amount),
        status: result.payment.status,
      },
      booking: {
        id: result.booking.id,
        publicCode: result.booking.publicCode,
        paymentStatus: result.booking.paymentStatus,
        status: result.booking.status,
        paidAmount: decimalToString(result.booking.paidAmount),
        remainingAmount: decimalToString(result.booking.remainingAmount),
        totalAmount: decimalToString(result.booking.totalAmount),
        depositAmount: decimalToString(result.booking.depositAmount),
      },
    };
  }

  async getPaymentForMockPage(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: { include: { customer: true } },
      },
    });
    if (!payment || payment.provider !== 'mock') {
      throw new NotFoundException('Mock payment not found');
    }
    return payment;
  }

  async handleMockAction(paymentId: string, outcome: 'success' | 'fail') {
    const provider = this.mock;
    const result = await provider.handleWebhook({
      headers: {},
      body: { paymentId, outcome },
    });
    if (result.event) {
      await this.applyWebhookEvent('mock', result.event);
    }
    return result.responseBody;
  }

  async handleProviderWebhook(
    name: PaymentProviderName,
    ctx: ProviderWebhookContext,
  ): Promise<ProviderWebhookResult> {
    const provider = this.getProvider(name);
    // Providers verify signatures themselves and return protocol-shaped errors.
    const result = await provider.handleWebhook(ctx);
    if (result.event && result.event.type !== 'noop') {
      await this.applyWebhookEvent(name, result.event);
    }
    return result;
  }

  /**
   * Apply a normalized payment event idempotently.
   * Late payments on cancelled bookings are logged + flagged for manual review.
   */
  async applyWebhookEvent(
    provider: PaymentProviderName,
    event: NormalizedWebhookEvent,
  ): Promise<{ applied: boolean; duplicate: boolean; lateManualReview: boolean }> {
    if (event.type === 'noop') {
      return { applied: false, duplicate: false, lateManualReview: false };
    }

    if (event.type === 'payment.failed') {
      return this.applyFailed(provider, event);
    }

    return this.applySucceeded(provider, event);
  }

  private async applyFailed(
    provider: PaymentProviderName,
    event: NormalizedWebhookEvent,
  ) {
    const payment = await this.findPaymentRow(provider, event);
    if (!payment) {
      this.logger.warn({ event, provider }, 'Failed payment webhook: payment not found');
      return { applied: false, duplicate: false, lateManualReview: false };
    }
    if (
      payment.status === PaymentRecordStatus.failed ||
      payment.status === PaymentRecordStatus.succeeded
    ) {
      return { applied: false, duplicate: true, lateManualReview: false };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.failed,
          providerTxnId: payment.providerTxnId ?? event.providerTxnId ?? null,
          payload: {
            ...(asObject(payment.payload) ?? {}),
            lastEvent: event.raw as Prisma.InputJsonValue,
            failedAt: new Date().toISOString(),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: ActorType.system,
          actorId: null,
          entity: 'payment',
          entityId: payment.id,
          action: 'failed',
          diff: {
            bookingId: payment.bookingId,
            publicCode: payment.booking.publicCode,
            provider,
            providerTxnId: event.providerTxnId ?? null,
            beforeStatus: payment.status,
            afterStatus: PaymentRecordStatus.failed,
          },
        },
      });
    });

    const payload: PaymentFailedPayload = {
      bookingId: payment.bookingId,
      paymentId: payment.id,
      publicCode: payment.booking.publicCode,
      provider,
    };
    this.events.emit(PAYMENT_FAILED_EVENT, payload);
    return { applied: true, duplicate: false, lateManualReview: false };
  }

  private async applySucceeded(
    provider: PaymentProviderName,
    event: NormalizedWebhookEvent,
  ): Promise<{ applied: boolean; duplicate: boolean; lateManualReview: boolean }> {
    // Idempotency by provider_txn_id
    if (event.providerTxnId) {
      const byTxn = await this.prisma.payment.findFirst({
        where: {
          provider: provider as PrismaPaymentProvider,
          providerTxnId: event.providerTxnId,
        },
        include: { booking: true },
      });
      if (byTxn?.status === PaymentRecordStatus.succeeded) {
        const alreadyFlagged = Boolean(
          (asObject(byTxn.payload) as { latePaymentManualReview?: boolean } | null)
            ?.latePaymentManualReview,
        );
        this.logger.log(
          { paymentId: byTxn.id, providerTxnId: event.providerTxnId },
          'Idempotent payment webhook — already succeeded',
        );
        return {
          applied: false,
          duplicate: true,
          lateManualReview: alreadyFlagged,
        };
      }
    }

    const payment = await this.findPaymentRow(provider, event);
    if (!payment) {
      this.logger.warn({ event, provider }, 'Success webhook: payment not found');
      return { applied: false, duplicate: false, lateManualReview: false };
    }

    if (payment.status === PaymentRecordStatus.succeeded) {
      return { applied: false, duplicate: true, lateManualReview: false };
    }

    const booking = payment.booking;
    const isPayableStatus = booking.status === BookingStatus.pending_payment;

    if (!isPayableStatus) {
      // Late / orphaned payment — do not crash; flag for manual review
      const reason =
        booking.status === BookingStatus.cancelled
          ? 'booking_cancelled_hold_expired_or_manual'
          : `booking_status_${booking.status}`;

      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentRecordStatus.succeeded,
            providerTxnId: event.providerTxnId || payment.providerTxnId,
            payload: {
              ...(asObject(payment.payload) ?? {}),
              latePaymentManualReview: true,
              reason,
              bookingStatusAtWebhook: booking.status,
              receivedAt: new Date().toISOString(),
              raw: event.raw as Prisma.InputJsonValue,
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorType: ActorType.system,
            actorId: null,
            entity: 'payment',
            entityId: payment.id,
            action: 'late_payment_manual_review',
            diff: {
              bookingId: booking.id,
              bookingStatus: booking.status,
              provider,
              providerTxnId: event.providerTxnId,
              amount: decimalToString(payment.amount),
              reason,
            },
          },
        });
      });

      this.logger.warn(
        {
          paymentId: payment.id,
          bookingId: booking.id,
          bookingStatus: booking.status,
          providerTxnId: event.providerTxnId,
        },
        'Late payment on non-pending booking — flagged for manual review',
      );

      const latePayload: PaymentLateManualReviewPayload = {
        bookingId: booking.id,
        paymentId: payment.id,
        publicCode: booking.publicCode,
        provider,
        amount: decimalToString(payment.amount),
        providerTxnId: event.providerTxnId,
        bookingStatus: booking.status,
        reason,
      };
      this.events.emit(PAYMENT_LATE_MANUAL_REVIEW_EVENT, latePayload);

      return { applied: true, duplicate: false, lateManualReview: true };
    }

    await this.prisma.$transaction(async (tx) => {
      // Re-check idempotency inside txn
      const current = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!current || current.status === PaymentRecordStatus.succeeded) {
        return;
      }

      const deposit = booking.depositAmount;
      const remaining = booking.totalAmount.sub(deposit);

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.succeeded,
          providerTxnId: event.providerTxnId || current.providerTxnId,
          payload: {
            ...(asObject(current.payload) ?? {}),
            raw: event.raw as Prisma.InputJsonValue,
            succeededAt: new Date().toISOString(),
          },
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.deposit_paid,
          paymentStatus: PaymentStatus.deposit_paid,
          paidAmount: deposit,
          remainingAmount: remaining,
          expiresAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: ActorType.system,
          actorId: null,
          entity: 'payment',
          entityId: payment.id,
          action: 'succeeded',
          diff: {
            before: {
              bookingStatus: booking.status,
              paymentStatus: booking.paymentStatus,
              paidAmount: decimalToString(booking.paidAmount),
            },
            after: {
              bookingStatus: BookingStatus.deposit_paid,
              paymentStatus: PaymentStatus.deposit_paid,
              paidAmount: decimalToString(deposit),
              remainingAmount: decimalToString(remaining),
              provider,
              providerTxnId: event.providerTxnId,
            },
          },
        },
      });
    });

    const received: PaymentReceivedPayload = {
      bookingId: booking.id,
      paymentId: payment.id,
      publicCode: booking.publicCode,
      provider,
      amount: decimalToString(payment.amount),
      providerTxnId: event.providerTxnId,
    };
    this.events.emit(PAYMENT_RECEIVED_EVENT, received);

    return { applied: true, duplicate: false, lateManualReview: false };
  }

  private async findPaymentRow(
    provider: PaymentProviderName,
    event: NormalizedWebhookEvent,
  ) {
    if (event.paymentId) {
      const byId = await this.prisma.payment.findFirst({
        where: {
          id: event.paymentId,
          provider: provider as PrismaPaymentProvider,
        },
        include: { booking: true },
      });
      if (byId) {
        return byId;
      }
    }
    if (event.providerTxnId) {
      return this.prisma.payment.findFirst({
        where: {
          provider: provider as PrismaPaymentProvider,
          providerTxnId: event.providerTxnId,
        },
        include: { booking: true },
      });
    }
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
