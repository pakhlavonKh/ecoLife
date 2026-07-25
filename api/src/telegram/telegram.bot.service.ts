import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, GrammyError, HttpError } from 'grammy';
import { DashboardService } from '../dashboard/dashboard.service';
import { setTelegramBotUsername } from './telegram.bot-username';
import { formatToday } from './telegram.messages';
import { TelegramInvitesService } from './telegram-invites.service';
import { TelegramQueueService } from './telegram.queue.service';
import { TelegramRecipientsService } from './telegram-recipients.service';
import { telegramRoleLabel } from './telegram.roles';

function inviteErrorMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    const res = error.getResponse();
    if (typeof res === 'string') {
      return res;
    }
    if (typeof res === 'object' && res && 'message' in res) {
      const message = (res as { message: string | string[] }).message;
      return Array.isArray(message) ? message.join('; ') : message;
    }
  }
  return 'Не удалось активировать код. Попробуйте позже или попросите новый у администратора.';
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot | null = null;
  private enabled = false;
  /** Env fallback chat IDs (used only when recipients table is empty). */
  private readonly envChatIds = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly queue: TelegramQueueService,
    private readonly dashboard: DashboardService,
    private readonly recipients: TelegramRecipientsService,
    private readonly invites: TelegramInvitesService,
  ) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  async onModuleInit(): Promise<void> {
    const token = (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    const rawIds =
      this.config.get<string>('TELEGRAM_ADMIN_CHAT_IDS') ?? '';
    const ids = rawIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const id of ids) {
      this.envChatIds.add(id);
    }

    try {
      const migrated = await this.recipients.migrateEnvChatIds(rawIds);
      if (migrated > 0) {
        this.logger.log(
          `Migrated ${migrated} TELEGRAM_ADMIN_CHAT_IDS → telegram_recipients (admin)`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { err: msg },
        'Could not migrate TELEGRAM_ADMIN_CHAT_IDS (tables may not exist yet)',
      );
    }

    if (!token) {
      this.logger.log(
        'TELEGRAM_BOT_TOKEN is empty — Telegram bot disabled',
      );
      this.queue.configure({ sendFn: null, adminChatIds: [] });
      return;
    }

    /**
     * TELEGRAM_BOT_ROLE:
     * - all (default): outbound notifications + long-polling (/today) — local/dev
     * - api: outbound only (prod API container; worker handles polling)
     * - worker: long-polling only (prod bot container)
     */
    const role = (
      this.config.get<string>('TELEGRAM_BOT_ROLE') ?? 'all'
    )
      .trim()
      .toLowerCase();
    const enableOutbound = role === 'all' || role === 'api';
    const enablePolling = role === 'all' || role === 'worker';

    const outboundIds = await this.resolveOutboundChatIds(ids);
    if (outboundIds.length === 0) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN set but no recipients / TELEGRAM_ADMIN_CHAT_IDS — outbound notifications disabled',
      );
    }

    const bot = new Bot(token);
    this.bot = bot;
    this.enabled = true;

    try {
      const me = await bot.api.getMe();
      setTelegramBotUsername(me.username);
      const fromEnv = (
        this.config.get<string>('TELEGRAM_BOT_USERNAME') ?? ''
      ).trim();
      if (!fromEnv && me.username) {
        this.logger.log(`Telegram bot username: @${me.username}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn({ err: msg }, 'getMe failed — deep links may be incomplete');
    }

    if (enableOutbound) {
      this.queue.configure({
        sendFn: async (chatId, text) => {
          await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
        },
        adminChatIds: outboundIds,
      });
      this.logger.log(`Telegram outbound enabled (role=${role})`);
    } else {
      this.queue.configure({ sendFn: null, adminChatIds: [] });
      this.logger.log(`Telegram outbound skipped (role=${role})`);
    }

    if (!enablePolling) {
      this.logger.log(
        `Telegram long-polling skipped (role=${role}) — use bot worker for commands`,
      );
      return;
    }

    bot.command('start', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId === undefined) {
        return;
      }

      const payload =
        typeof ctx.match === 'string' ? ctx.match.trim() : '';

      if (!payload) {
        await ctx.reply(
          'Этот бот для сотрудников EcoLife. Попросите код приглашения у администратора.',
        );
        return;
      }

      try {
        const result = await this.invites.redeem(payload, BigInt(chatId));
        const greeting = this.invites.roleGreeting(result.role);
        await ctx.reply(
          result.rebound
            ? `${greeting}\nРоль обновлена.`
            : greeting,
        );
      } catch (error) {
        const msg = inviteErrorMessage(error);
        this.logger.warn(
          {
            chatId,
            err: error instanceof Error ? error.message : String(error),
          },
          'Invite redeem failed',
        );
        try {
          await ctx.reply(msg);
        } catch {
          /* ignore */
        }
      }
    });

    bot.command('whoami', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId === undefined) {
        return;
      }

      const recipient = await this.recipients.findByChatId(BigInt(chatId));
      if (!recipient) {
        await ctx.reply(
          'Вы не подключены. Откройте ссылку-приглашение или отправьте /start КОД.',
        );
        return;
      }
      if (!recipient.isActive) {
        await ctx.reply('Доступ отключён. Обратитесь к администратору.');
        return;
      }

      const muted =
        recipient.mutedUntil && recipient.mutedUntil.getTime() > Date.now()
          ? `\nПауза уведомлений до: ${recipient.mutedUntil.toISOString()}`
          : '';
      await ctx.reply(
        [
          `Имя: ${recipient.name}`,
          `Роль: ${telegramRoleLabel(recipient.role)} (${recipient.role})`,
          `Статус: активен`,
          `chat_id: ${recipient.chatId.toString()}`,
          muted,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    });

    bot.command('today', async (ctx) => {
      const access = await this.resolveCommandAccess(ctx.chat?.id);
      if (access === 'denied') {
        this.logger.warn(
          { chatId: ctx.chat?.id },
          'Ignored /today from unauthorized chat',
        );
        return;
      }
      if (access === 'inactive') {
        await ctx.reply('Доступ отключён. Обратитесь к администратору.');
        return;
      }
      try {
        const stats = await this.dashboard.getStats();
        const text = formatToday(
          stats.today,
          stats.arrivalsList,
          stats.departuresList,
        );
        await ctx.reply(text, { parse_mode: 'HTML' });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        this.logger.error({ err: msg }, 'Failed to handle /today');
        try {
          await ctx.reply('Не удалось получить данные. Попробуйте позже.');
        } catch {
          /* ignore */
        }
      }
    });

    bot.catch((err) => {
      const ctx = err.ctx;
      const e = err.error;
      if (e instanceof GrammyError) {
        this.logger.error(
          { chatId: ctx.chat?.id, description: e.description },
          'Grammy error',
        );
      } else if (e instanceof HttpError) {
        this.logger.error({ err: String(e) }, 'Telegram HTTP error');
      } else {
        this.logger.error(
          { err: e instanceof Error ? e.message : String(e) },
          'Telegram bot error',
        );
      }
    });

    void bot
      .start({
        onStart: (info) => {
          setTelegramBotUsername(info.username);
          this.logger.log(`Telegram bot @${info.username} started`);
        },
      })
      .catch((error: unknown) => {
        const msg =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          { err: msg },
          'Telegram bot failed to start (API continues without bot)',
        );
        this.enabled = false;
        if (enableOutbound) {
          this.queue.configure({ sendFn: null, adminChatIds: [] });
        }
      });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      try {
        await this.bot.stop();
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        this.logger.warn({ err: msg }, 'Error stopping Telegram bot');
      }
      this.bot = null;
    }
    this.enabled = false;
  }

  /**
   * Prefer DB recipients; fall back to env only when the table is empty (§8).
   */
  private async resolveOutboundChatIds(envIds: string[]): Promise<string[]> {
    try {
      const rows = await this.recipients.list();
      const active = rows.filter((r) => r.isActive).map((r) => r.chatId);
      if (active.length > 0) {
        return active;
      }
      if (envIds.length > 0) {
        this.logger.warn(
          'telegram_recipients is empty — falling back to TELEGRAM_ADMIN_CHAT_IDS (deprecated)',
        );
      }
      return envIds;
    } catch {
      return envIds;
    }
  }

  private async resolveCommandAccess(
    chatId: number | undefined,
  ): Promise<'ok' | 'inactive' | 'denied'> {
    if (chatId === undefined) {
      return 'denied';
    }

    try {
      const recipient = await this.recipients.findByChatId(BigInt(chatId));
      if (recipient) {
        return recipient.isActive ? 'ok' : 'inactive';
      }

      const total = await this.recipients.countActive();
      if (total === 0 && this.envChatIds.has(String(chatId))) {
        return 'ok';
      }
    } catch {
      if (this.envChatIds.has(String(chatId))) {
        return 'ok';
      }
    }

    return 'denied';
  }
}
