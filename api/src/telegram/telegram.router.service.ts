import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationEvent, TelegramStaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRulesService } from './notification-rules.service';
import {
  RoutedDelivery,
  RoutingRecipient,
  routeEvent,
  scopeForRole,
} from './telegram.routing';

@Injectable()
export class TelegramRouterService {
  private readonly logger = new Logger(TelegramRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: NotificationRulesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve per-recipient deliveries for a notification event.
   * Falls back to TELEGRAM_ADMIN_CHAT_IDS (as admin/full) only when
   * telegram_recipients has no active rows (§8).
   */
  async resolve(event: NotificationEvent): Promise<RoutedDelivery[]> {
    const rules = await this.rules.listRules();
    let recipients: RoutingRecipient[] = [];

    try {
      const rows = await this.prisma.telegramRecipient.findMany({
        where: { isActive: true },
      });
      recipients = rows.map((r) => ({
        chatId: r.chatId.toString(),
        role: r.role,
        language: r.language,
        isActive: r.isActive,
        mutedUntil: r.mutedUntil,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn({ err: msg }, 'Failed to load telegram_recipients');
    }

    if (recipients.length > 0) {
      return routeEvent(event, rules, recipients);
    }

    const envIds = this.envChatIds();
    if (envIds.length === 0) {
      return [];
    }

    this.logger.warn(
      'telegram_recipients is empty — falling back to TELEGRAM_ADMIN_CHAT_IDS (deprecated)',
    );

    const enabled = new Set(
      rules.filter((r) => r.event === event && r.enabled).map((r) => r.role),
    );
    if (!enabled.has(TelegramStaffRole.admin)) {
      return [];
    }

    return envIds.map((chatId) => ({
      chatId,
      role: TelegramStaffRole.admin,
      scope: scopeForRole(TelegramStaffRole.admin),
      language: 'uz' as const,
    }));
  }

  private envChatIds(): string[] {
    const raw = this.config.get<string>('TELEGRAM_ADMIN_CHAT_IDS') ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
