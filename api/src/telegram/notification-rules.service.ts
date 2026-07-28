import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationEvent, TelegramStaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_STAFF_ROLES,
  DEFAULT_NOTIFICATION_MATRIX,
  RoutingRule,
  enabledRolesForEvent,
} from './telegram.routing';

@Injectable()
export class NotificationRulesService implements OnModuleInit {
  private readonly logger = new Logger(NotificationRulesService.name);
  private cache: RoutingRule[] | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureDefaults();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { err: msg },
        'Could not ensure notification_rules defaults on boot',
      );
    }
  }

  /** Drop the in-memory matrix so the next read hits the DB. */
  invalidate(): void {
    this.cache = null;
  }

  async listRules(): Promise<RoutingRule[]> {
    return this.loadRules();
  }

  async getEnabledRoles(event: NotificationEvent): Promise<TelegramStaffRole[]> {
    const rules = await this.loadRules();
    return enabledRolesForEvent(event, rules);
  }

  /**
   * Ensure every (event, role) row exists (enabled per DEFAULT matrix).
   * Idempotent — safe on boot if seed was skipped.
   */
  async ensureDefaults(): Promise<void> {
    for (const event of Object.values(NotificationEvent)) {
      for (const role of ALL_STAFF_ROLES) {
        const enabled = Boolean(DEFAULT_NOTIFICATION_MATRIX[event][role]);
        await this.prisma.notificationRule.upsert({
          where: { event_role: { event, role } },
          create: { event, role, enabled },
          update: {},
        });
      }
    }
    this.invalidate();
  }

  private async loadRules(): Promise<RoutingRule[]> {
    if (this.cache) {
      return this.cache;
    }
    try {
      const rows = await this.prisma.notificationRule.findMany();
      if (rows.length === 0) {
        this.logger.warn(
          'notification_rules empty — using in-memory DEFAULT_NOTIFICATION_MATRIX',
        );
        this.cache = Object.values(NotificationEvent).flatMap((event) =>
          ALL_STAFF_ROLES.map((role) => ({
            event,
            role,
            enabled: Boolean(DEFAULT_NOTIFICATION_MATRIX[event][role]),
          })),
        );
        return this.cache;
      }
      this.cache = rows.map((r) => ({
        event: r.event,
        role: r.role,
        enabled: r.enabled,
      }));
      return this.cache;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { err: msg },
        'Failed to load notification_rules — using defaults',
      );
      this.cache = Object.values(NotificationEvent).flatMap((event) =>
        ALL_STAFF_ROLES.map((role) => ({
          event,
          role,
          enabled: Boolean(DEFAULT_NOTIFICATION_MATRIX[event][role]),
        })),
      );
      return this.cache;
    }
  }
}
