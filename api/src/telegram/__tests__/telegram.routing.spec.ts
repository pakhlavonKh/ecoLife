import { NotificationEvent, TelegramStaffRole } from '@prisma/client';
import {
  DEFAULT_NOTIFICATION_MATRIX,
  RoutingRecipient,
  defaultNotificationRules,
  routeEvent,
} from '../telegram.routing';

const FIXTURE_RECIPIENTS: RoutingRecipient[] = [
  {
    chatId: '100',
    role: TelegramStaffRole.owner,
    isActive: true,
    mutedUntil: null,
  },
  {
    chatId: '200',
    role: TelegramStaffRole.admin,
    isActive: true,
    mutedUntil: null,
  },
  {
    chatId: '300',
    role: TelegramStaffRole.manager,
    isActive: true,
    mutedUntil: null,
  },
  {
    chatId: '400',
    role: TelegramStaffRole.cleaner,
    isActive: true,
    mutedUntil: null,
  },
  {
    chatId: '401',
    role: TelegramStaffRole.cleaner,
    isActive: false,
    mutedUntil: null,
  },
  {
    chatId: '201',
    role: TelegramStaffRole.admin,
    isActive: true,
    mutedUntil: new Date('2099-01-01T00:00:00.000Z'),
  },
];

function chatIdsFor(event: NotificationEvent): string[] {
  return routeEvent(event, defaultNotificationRules(), FIXTURE_RECIPIENTS)
    .map((d) => d.chatId)
    .sort();
}

describe('telegram routing matrix (§4)', () => {
  it('routes each event to exactly the expected chat_ids', () => {
    expect(chatIdsFor(NotificationEvent.booking_created)).toEqual([
      '100',
      '200',
      '300',
    ]);
    expect(chatIdsFor(NotificationEvent.payment_received)).toEqual([
      '100',
      '200',
      '300',
    ]);
    expect(chatIdsFor(NotificationEvent.booking_checked_in)).toEqual([
      '200',
      '300',
    ]);
    expect(chatIdsFor(NotificationEvent.booking_checked_out)).toEqual([
      '200',
      '300',
      '400',
    ]);
    expect(chatIdsFor(NotificationEvent.booking_updated)).toEqual([
      '100',
      '200',
      '300',
    ]);
    expect(chatIdsFor(NotificationEvent.booking_cancelled)).toEqual([
      '100',
      '200',
      '300',
    ]);
    expect(chatIdsFor(NotificationEvent.system_hold_expired)).toEqual([
      '200',
    ]);
    expect(chatIdsFor(NotificationEvent.system_late_payment_review)).toEqual([
      '200',
    ]);
    expect(chatIdsFor(NotificationEvent.system_payment_failed)).toEqual([
      '200',
    ]);
    expect(chatIdsFor(NotificationEvent.digest_morning)).toEqual([
      '100',
      '200',
      '300',
      '400',
    ]);
  });

  it('excludes inactive and muted recipients', () => {
    const checkout = chatIdsFor(NotificationEvent.booking_checked_out);
    expect(checkout).not.toContain('401');
    expect(checkout).not.toContain('201');
  });

  it('cleaner never receives booking.created / payment.received', () => {
    expect(chatIdsFor(NotificationEvent.booking_created)).not.toContain('400');
    expect(chatIdsFor(NotificationEvent.payment_received)).not.toContain(
      '400',
    );
  });

  it('respects disabled rules in the matrix snapshot', () => {
    const rules = defaultNotificationRules().map((r) =>
      r.event === NotificationEvent.booking_checked_out &&
      r.role === TelegramStaffRole.cleaner
        ? { ...r, enabled: false }
        : r,
    );
    const ids = routeEvent(
      NotificationEvent.booking_checked_out,
      rules,
      FIXTURE_RECIPIENTS,
    ).map((d) => d.chatId);
    expect(ids).toEqual(['200', '300']);
  });

  it('DEFAULT_NOTIFICATION_MATRIX matches §4 cleaner column', () => {
    expect(
      DEFAULT_NOTIFICATION_MATRIX[NotificationEvent.booking_checked_out]
        .cleaner,
    ).toBe(true);
    expect(
      DEFAULT_NOTIFICATION_MATRIX[NotificationEvent.digest_morning].cleaner,
    ).toBe(true);
    expect(
      DEFAULT_NOTIFICATION_MATRIX[NotificationEvent.booking_created].cleaner,
    ).toBeUndefined();
  });
});
