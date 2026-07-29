import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramLanguage, TelegramStaffRole } from '@prisma/client';
import { Bot, GrammyError, HttpError, InlineKeyboard } from 'grammy';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  DEFAULT_TELEGRAM_LANG,
  dict,
  parseTelegramLang,
  toTelegramLang,
  tt,
  type TelegramLang,
} from './i18n';
import { setTelegramBotUsername } from './telegram.bot-username';
import { formatOwnerStats, formatToday } from './telegram.messages';
import {
  parseCustomStatsRange,
  resolveStatsPresetRange,
  type StatsPeriodPreset,
} from './stats-period';
import { TelegramInvitesService } from './telegram-invites.service';
import { TelegramQueueService } from './telegram.queue.service';
import { TelegramRecipientsService } from './telegram-recipients.service';
import { scopeForRole } from './telegram.routing';
import { telegramRoleLabel } from './telegram.roles';

function inviteErrorMessage(error: unknown, lang: TelegramLang): string {
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
  return tt(lang, 'commands.inviteFailed');
}

function langKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(tt('ru', 'commands.langButtonRu'), 'lang:ru')
    .text(tt('uz', 'commands.langButtonUz'), 'lang:uz');
}

function statsPeriodKeyboard(lang: TelegramLang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tt(lang, 'stats.buttonDay'), 'stats:day')
    .text(tt(lang, 'stats.buttonWeek'), 'stats:week')
    .row()
    .text(tt(lang, 'stats.buttonMonth'), 'stats:month')
    .text(tt(lang, 'stats.buttonCustom'), 'stats:custom');
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot | null = null;
  private enabled = false;
  /** Env fallback chat IDs (used only when recipients table is empty). */
  private readonly envChatIds = new Set<string>();
  /** Owner chats awaiting custom /stats date range text. */
  private readonly awaitingStatsCustom = new Set<string>();

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
      this.queue.configure({ sendFn: null, onForbidden: null });
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
        onForbidden: async (chatId) => {
          const deactivated =
            await this.recipients.deactivateBlockedChat(chatId);
          if (deactivated) {
            this.logger.warn(
              { chatId },
              'Recipient auto-deactivated after Telegram 403',
            );
          }
        },
      });
      this.logger.log(`Telegram outbound enabled (role=${role})`);
    } else {
      this.queue.configure({ sendFn: null, onForbidden: null });
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

      this.clearStatsCustomAwait(chatId);

      const payload =
        typeof ctx.match === 'string' ? ctx.match.trim() : '';
      const lang = await this.langForChat(chatId);

      if (!payload) {
        await ctx.reply(tt(lang, 'commands.startStaffOnly'));
        return;
      }

      try {
        const result = await this.invites.redeem(payload, BigInt(chatId));
        const greetingLang = await this.langForChat(chatId);
        const greeting = this.invites.roleGreeting(result.role, greetingLang);
        await ctx.reply(
          result.rebound
            ? `${greeting}\n${tt(greetingLang, 'commands.roleUpdated')}`
            : greeting,
        );
      } catch (error) {
        const msg = inviteErrorMessage(error, lang);
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

      this.clearStatsCustomAwait(chatId);

      const recipient = await this.recipients.findByChatId(BigInt(chatId));
      const lang = toTelegramLang(recipient?.language);
      if (!recipient) {
        await ctx.reply(tt(lang, 'commands.whoamiNotLinked'));
        return;
      }
      if (!recipient.isActive) {
        await ctx.reply(tt(lang, 'commands.accessDisabled'));
        return;
      }

      const muted =
        recipient.mutedUntil && recipient.mutedUntil.getTime() > Date.now()
          ? `\n${tt(lang, 'common.mutedUntil')}: ${recipient.mutedUntil.toISOString()}`
          : '';
      await ctx.reply(
        [
          `${tt(lang, 'common.name')}: ${recipient.name}`,
          `${tt(lang, 'common.role')}: ${telegramRoleLabel(recipient.role, lang)} (${recipient.role})`,
          `${tt(lang, 'common.status')}: ${tt(lang, 'common.active')}`,
          `${tt(lang, 'common.language')}: ${dict(lang).langNames[lang]}`,
          `chat_id: ${recipient.chatId.toString()}`,
          muted,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    });

    bot.command('lang', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId === undefined) {
        return;
      }

      this.clearStatsCustomAwait(chatId);

      const access = await this.resolveCommandAccess(chatId);
      if (access.status === 'denied') {
        this.logger.warn(
          { chatId },
          'Ignored /lang from unauthorized chat',
        );
        return;
      }
      if (access.status === 'inactive') {
        const lang = await this.langForChat(chatId);
        await ctx.reply(tt(lang, 'commands.accessDisabled'));
        return;
      }

      const lang = await this.langForChat(chatId);
      const arg =
        typeof ctx.match === 'string' ? ctx.match.trim().toLowerCase() : '';
      const parsed = parseTelegramLang(arg);
      if (parsed) {
        await this.applyLanguage(chatId, parsed, ctx);
        return;
      }

      await ctx.reply(
        `${tt(lang, 'commands.langCurrent', {
          language: dict(lang).langNames[lang],
        })}\n${tt(lang, 'commands.langPrompt')}`,
        { reply_markup: langKeyboard() },
      );
    });

    bot.callbackQuery(/^lang:(ru|uz)$/, async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId === undefined) {
        await ctx.answerCallbackQuery();
        return;
      }
      const access = await this.resolveCommandAccess(chatId);
      if (access.status !== 'ok') {
        await ctx.answerCallbackQuery();
        return;
      }
      const next = parseTelegramLang(ctx.match?.[1]);
      if (!next) {
        await ctx.answerCallbackQuery();
        return;
      }
      await this.applyLanguage(chatId, next, ctx);
      try {
        await ctx.answerCallbackQuery();
      } catch {
        /* ignore */
      }
    });

    bot.command('today', async (ctx) => {
      this.clearStatsCustomAwait(ctx.chat?.id);
      const access = await this.resolveCommandAccess(ctx.chat?.id);
      const lang = await this.langForChat(ctx.chat?.id);
      if (access.status === 'denied') {
        this.logger.warn(
          { chatId: ctx.chat?.id },
          'Ignored /today from unauthorized chat',
        );
        return;
      }
      if (access.status === 'inactive') {
        await ctx.reply(tt(lang, 'commands.accessDisabled'));
        return;
      }
      try {
        const stats = await this.dashboard.getStats();
        const scope = scopeForRole(
          access.role ?? TelegramStaffRole.admin,
        );
        const text = formatToday(
          stats.today,
          stats.arrivalsList,
          stats.departuresList,
          lang,
          scope,
        );
        await ctx.reply(text, { parse_mode: 'HTML' });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        this.logger.error({ err: msg }, 'Failed to handle /today');
        try {
          await ctx.reply(tt(lang, 'commands.todayFailed'));
        } catch {
          /* ignore */
        }
      }
    });

    bot.command('stats', async (ctx) => {
      const chatId = ctx.chat?.id;
      const access = await this.resolveOwnerStatsAccess(chatId);
      const lang = await this.langForChat(chatId);
      if (access.status === 'denied') {
        this.logger.warn(
          { chatId },
          'Ignored /stats from unauthorized chat',
        );
        await ctx.reply(tt(lang, 'commands.statsForbidden'));
        return;
      }
      if (access.status === 'inactive') {
        await ctx.reply(tt(lang, 'commands.accessDisabled'));
        return;
      }
      if (access.status === 'forbidden') {
        await ctx.reply(tt(lang, 'commands.statsForbidden'));
        return;
      }

      this.clearStatsCustomAwait(chatId);
      await ctx.reply(tt(lang, 'stats.prompt'), {
        reply_markup: statsPeriodKeyboard(lang),
      });
    });

    bot.callbackQuery(/^stats:(day|week|month|custom)$/, async (ctx) => {
      const chatId = ctx.chat?.id;
      const access = await this.resolveOwnerStatsAccess(chatId);
      const lang = await this.langForChat(chatId);
      const preset = ctx.match?.[1] as
        | StatsPeriodPreset
        | 'custom'
        | undefined;

      try {
        await ctx.answerCallbackQuery();
      } catch {
        /* ignore */
      }

      if (access.status !== 'ok' || !preset) {
        if (access.status === 'forbidden' || access.status === 'denied') {
          try {
            await ctx.reply(tt(lang, 'commands.statsForbidden'));
          } catch {
            /* ignore */
          }
        } else if (access.status === 'inactive') {
          try {
            await ctx.reply(tt(lang, 'commands.accessDisabled'));
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (preset === 'custom') {
        this.setStatsCustomAwait(chatId);
        await ctx.reply(tt(lang, 'stats.customPrompt'));
        return;
      }

      this.clearStatsCustomAwait(chatId);
      await this.replyOwnerStatsReport(ctx, lang, resolveStatsPresetRange(preset));
    });

    bot.on('message:text', async (ctx, next) => {
      const chatId = ctx.chat?.id;
      if (chatId === undefined || !this.awaitingStatsCustom.has(String(chatId))) {
        await next();
        return;
      }

      const text = ctx.message.text.trim();
      if (text.startsWith('/')) {
        this.clearStatsCustomAwait(chatId);
        await next();
        return;
      }

      const access = await this.resolveOwnerStatsAccess(chatId);
      const lang = await this.langForChat(chatId);
      if (access.status !== 'ok') {
        this.clearStatsCustomAwait(chatId);
        if (access.status === 'inactive') {
          await ctx.reply(tt(lang, 'commands.accessDisabled'));
        } else {
          await ctx.reply(tt(lang, 'commands.statsForbidden'));
        }
        return;
      }

      const range = parseCustomStatsRange(text);
      if (!range) {
        await ctx.reply(tt(lang, 'stats.customInvalid'));
        return;
      }

      this.clearStatsCustomAwait(chatId);
      await this.replyOwnerStatsReport(ctx, lang, range);
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
          this.queue.configure({ sendFn: null, onForbidden: null });
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

  private async langForChat(
    chatId: number | undefined,
  ): Promise<TelegramLang> {
    if (chatId === undefined) {
      return DEFAULT_TELEGRAM_LANG;
    }
    try {
      const recipient = await this.recipients.findByChatId(BigInt(chatId));
      return toTelegramLang(recipient?.language);
    } catch {
      return DEFAULT_TELEGRAM_LANG;
    }
  }

  private async applyLanguage(
    chatId: number,
    language: TelegramLang,
    ctx: {
      reply: (text: string) => Promise<unknown>;
      editMessageText?: (text: string) => Promise<unknown>;
    },
  ): Promise<void> {
    const updated = await this.recipients.setLanguageByChatId(
      BigInt(chatId),
      language as TelegramLanguage,
    );
    if (!updated) {
      await ctx.reply(tt(language, 'commands.whoamiNotLinked'));
      return;
    }
    const text = tt(language, 'commands.langSaved', {
      language: dict(language).langNames[language],
    });

    if (ctx.editMessageText) {
      try {
        await ctx.editMessageText(text);
        return;
      } catch {
        /* fall through to reply */
      }
    }
    await ctx.reply(text);
  }

  private async replyOwnerStatsReport(
    ctx: { reply: (text: string, other?: object) => Promise<unknown> },
    lang: TelegramLang,
    range: { from: string; to: string },
  ): Promise<void> {
    try {
      const stats = await this.dashboard.getOwnerPeriodStats(
        range.from,
        range.to,
      );
      const text = formatOwnerStats(stats, lang);
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: msg, range }, 'Failed to handle /stats');
      try {
        await ctx.reply(tt(lang, 'commands.statsFailed'));
      } catch {
        /* ignore */
      }
    }
  }

  private setStatsCustomAwait(chatId: number | undefined): void {
    if (chatId === undefined) return;
    this.awaitingStatsCustom.add(String(chatId));
  }

  private clearStatsCustomAwait(chatId: number | undefined): void {
    if (chatId === undefined) return;
    this.awaitingStatsCustom.delete(String(chatId));
  }

  private async resolveOwnerStatsAccess(
    chatId: number | undefined,
  ): Promise<{
    status: 'ok' | 'inactive' | 'denied' | 'forbidden';
    role?: TelegramStaffRole;
  }> {
    const access = await this.resolveCommandAccess(chatId);
    if (access.status !== 'ok') {
      return access;
    }
    if (access.role !== TelegramStaffRole.owner) {
      return { status: 'forbidden', role: access.role };
    }
    return access;
  }

  private async resolveCommandAccess(
    chatId: number | undefined,
  ): Promise<{
    status: 'ok' | 'inactive' | 'denied';
    role?: TelegramStaffRole;
  }> {
    if (chatId === undefined) {
      return { status: 'denied' };
    }

    try {
      const recipient = await this.recipients.findByChatId(BigInt(chatId));
      if (recipient) {
        return recipient.isActive
          ? { status: 'ok', role: recipient.role }
          : { status: 'inactive', role: recipient.role };
      }

      const total = await this.recipients.countActive();
      if (total === 0 && this.envChatIds.has(String(chatId))) {
        return { status: 'ok', role: TelegramStaffRole.admin };
      }
    } catch {
      if (this.envChatIds.has(String(chatId))) {
        return { status: 'ok', role: TelegramStaffRole.admin };
      }
    }

    return { status: 'denied' };
  }
}
