import {
  NotificationEvent,
  TelegramLanguage,
  TelegramStaffRole,
} from '@prisma/client';
import type { TelegramLang } from './i18n';
import { toTelegramLang } from './i18n';

/** Message field scope by staff role (§5). */
export type MessageScope = 'full' | 'cleaner';

export type RoutingRecipient = {
  chatId: string;
  role: TelegramStaffRole;
  language?: TelegramLanguage | TelegramLang | null;
  isActive: boolean;
  mutedUntil: Date | null;
};

export type RoutingRule = {
  event: NotificationEvent;
  role: TelegramStaffRole;
  enabled: boolean;
};

export type RoutedDelivery = {
  chatId: string;
  role: TelegramStaffRole;
  scope: MessageScope;
  language: TelegramLang;
};

/** Default event → role matrix from BOT_ROLES.md §4. */
export const DEFAULT_NOTIFICATION_MATRIX: Record<
  NotificationEvent,
  Partial<Record<TelegramStaffRole, boolean>>
> = {
  [NotificationEvent.booking_created]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.payment_received]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.booking_checked_in]: {
    admin: true,
    manager: true,
  },
  [NotificationEvent.booking_checked_out]: {
    admin: true,
    manager: true,
    cleaner: true,
  },
  [NotificationEvent.booking_updated]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.booking_cancelled]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.system_hold_expired]: {
    admin: true,
  },
  [NotificationEvent.system_late_payment_review]: {
    admin: true,
  },
  [NotificationEvent.system_payment_failed]: {
    admin: true,
  },
  [NotificationEvent.system_room_locked]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.digest_morning]: {
    owner: true,
    admin: true,
    manager: true,
    cleaner: true,
  },
};

export const ALL_STAFF_ROLES: TelegramStaffRole[] = [
  TelegramStaffRole.owner,
  TelegramStaffRole.admin,
  TelegramStaffRole.manager,
  TelegramStaffRole.cleaner,
];

/** Flatten DEFAULT_NOTIFICATION_MATRIX into rule rows (for tests / reset). */
export function defaultNotificationRules(): RoutingRule[] {
  const rules: RoutingRule[] = [];
  for (const event of Object.values(NotificationEvent)) {
    for (const role of ALL_STAFF_ROLES) {
      rules.push({
        event,
        role,
        enabled: Boolean(DEFAULT_NOTIFICATION_MATRIX[event][role]),
      });
    }
  }
  return rules;
}

export function scopeForRole(role: TelegramStaffRole): MessageScope {
  return role === TelegramStaffRole.cleaner ? 'cleaner' : 'full';
}

/** Enabled roles for an event from a rules snapshot. */
export function enabledRolesForEvent(
  event: NotificationEvent,
  rules: RoutingRule[],
): TelegramStaffRole[] {
  return rules
    .filter((r) => r.event === event && r.enabled)
    .map((r) => r.role);
}

/**
 * Resolve chat targets for an event (matrix ∩ active/unmuted recipients).
 * Pure — used by the router service and unit tests.
 */
export function routeEvent(
  event: NotificationEvent,
  rules: RoutingRule[],
  recipients: RoutingRecipient[],
  now: Date = new Date(),
): RoutedDelivery[] {
  const roles = new Set(enabledRolesForEvent(event, rules));
  if (roles.size === 0) {
    return [];
  }

  const nowMs = now.getTime();
  const out: RoutedDelivery[] = [];

  for (const r of recipients) {
    if (!r.isActive || !roles.has(r.role)) {
      continue;
    }
    // Include only when muted_until IS NULL OR muted_until < now (§4).
    if (r.mutedUntil && r.mutedUntil.getTime() >= nowMs) {
      continue;
    }
    out.push({
      chatId: r.chatId,
      role: r.role,
      scope: scopeForRole(r.role),
      language: toTelegramLang(r.language),
    });
  }

  return out;
}
