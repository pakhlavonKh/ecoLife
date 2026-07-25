import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, GrammyError, HttpError } from 'grammy';
import { DashboardService } from '../dashboard/dashboard.service';
import { formatToday } from './telegram.messages';
import { TelegramQueueService } from './telegram.queue.service';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot | null = null;
  private enabled = false;
  private readonly adminChatIds = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly queue: TelegramQueueService,
    private readonly dashboard: DashboardService,
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
      this.adminChatIds.add(id);
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

    if (ids.length === 0) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN set but TELEGRAM_ADMIN_CHAT_IDS is empty — outbound notifications disabled; /today will reject all chats',
      );
    }

    const bot = new Bot(token);
    this.bot = bot;
    this.enabled = true;

    if (enableOutbound) {
      this.queue.configure({
        sendFn: async (chatId, text) => {
          await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
        },
        adminChatIds: ids,
      });
      this.logger.log(`Telegram outbound enabled (role=${role})`);
    } else {
      this.queue.configure({ sendFn: null, adminChatIds: [] });
      this.logger.log(`Telegram outbound skipped (role=${role})`);
    }

    if (!enablePolling) {
      this.logger.log(
        `Telegram long-polling skipped (role=${role}) — use bot worker for /today`,
      );
      return;
    }

    bot.command('start', async (ctx) => {
      if (!this.isAdminChat(ctx.chat?.id)) {
        return;
      }
      await ctx.reply(
        'EcoLife admin bot.\nКоманда /today — заезды и выезды на сегодня.',
      );
    });

    bot.command('today', async (ctx) => {
      if (!this.isAdminChat(ctx.chat?.id)) {
        this.logger.warn(
          { chatId: ctx.chat?.id },
          'Ignored /today from non-admin chat',
        );
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

  private isAdminChat(chatId: number | undefined): boolean {
    if (chatId === undefined) {
      return false;
    }
    return this.adminChatIds.has(String(chatId));
  }
}
