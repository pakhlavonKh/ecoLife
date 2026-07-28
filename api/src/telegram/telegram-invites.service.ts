import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  Prisma,
  TelegramInvite,
  TelegramStaffRole,
} from '@prisma/client';
import { randomInt } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTelegramInviteDto } from './dto/create-telegram-invite.dto';
import { getTelegramBotUsername } from './telegram.bot-username';
import { tt, type TelegramLang } from './i18n';
import { telegramRoleLabel } from './telegram.roles';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type TelegramInviteView = {
  id: string;
  code: string;
  role: TelegramStaffRole;
  /** Live username from getMe / TELEGRAM_BOT_USERNAME (no @). */
  botUsername: string | null;
  /** https://t.me/<bot_username>?start=<CODE> */
  deepLink: string | null;
  createdById: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedByChatId: string | null;
  createdAt: Date;
  isPending: boolean;
};

@Injectable()
export class TelegramInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private botUsername(): string | null {
    // Prefer live getMe() cache; fall back to TELEGRAM_BOT_USERNAME env.
    const fromLive = getTelegramBotUsername();
    if (fromLive) {
      return fromLive;
    }
    const fromEnv = (
      this.config.get<string>('TELEGRAM_BOT_USERNAME') ?? ''
    ).trim();
    if (fromEnv) {
      return fromEnv.replace(/^@/, '');
    }
    return null;
  }

  private deepLink(code: string, username: string | null): string | null {
    if (!username) {
      return null;
    }
    // Telegram deep link — auto-clickable when pasted as a clean URL.
    return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
  }

  toView(row: TelegramInvite): TelegramInviteView {
    const now = Date.now();
    const isPending =
      row.usedAt === null && row.expiresAt.getTime() > now;
    const botUsername = this.botUsername();
    return {
      id: row.id,
      code: row.code,
      role: row.role,
      botUsername,
      deepLink: this.deepLink(row.code, botUsername),
      createdById: row.createdById,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      usedByChatId:
        row.usedByChatId !== null && row.usedByChatId !== undefined
          ? row.usedByChatId.toString()
          : null,
      createdAt: row.createdAt,
      isPending,
    };
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
  }

  async list(pendingOnly = false): Promise<TelegramInviteView[]> {
    const now = new Date();
    const rows = await this.prisma.telegramInvite.findMany({
      where: pendingOnly
        ? { usedAt: null, expiresAt: { gt: now } }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toView(r));
  }

  async create(
    dto: CreateTelegramInviteDto,
    actor: { type: ActorType; id: string },
  ): Promise<TelegramInviteView> {
    let created: TelegramInvite | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = this.generateCode();
      try {
        created = await this.prisma.telegramInvite.create({
          data: {
            code,
            role: dto.role,
            createdById: actor.id,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw new BadRequestException('Не удалось сгенерировать код приглашения');
    }

    const view = this.toView(created);
    await this.audit.write({
      actor,
      entity: 'telegram_invite',
      entityId: created.id,
      action: 'create',
      diff: { after: view },
    });
    return view;
  }

  async revoke(
    id: string,
    actor: { type: ActorType; id?: string },
  ): Promise<{ ok: true }> {
    const row = await this.prisma.telegramInvite.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Приглашение не найдено');
    }
    if (row.usedAt) {
      throw new BadRequestException('Приглашение уже использовано');
    }

    const before = this.toView(row);
    await this.prisma.telegramInvite.delete({ where: { id } });
    await this.audit.write({
      actor,
      entity: 'telegram_invite',
      entityId: id,
      action: 'revoke',
      diff: { before },
    });
    return { ok: true };
  }

  /**
   * Redeem invite code for a Telegram chat. Rebinds role if chat already exists.
   */
  async redeem(
    codeRaw: string,
    chatId: bigint,
  ): Promise<{ role: TelegramStaffRole; rebound: boolean }> {
    const code = codeRaw.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      throw new BadRequestException('Неверный код приглашения');
    }

    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.telegramInvite.findUnique({ where: { code } });
      if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException(
          'Код недействителен или срок его действия истёк. Попросите новый у администратора.',
        );
      }

      const existing = await tx.telegramRecipient.findUnique({
        where: { chatId },
      });

      let recipientId: string;
      let rebound = false;

      if (existing) {
        rebound = existing.role !== invite.role || !existing.isActive;
        const updated = await tx.telegramRecipient.update({
          where: { chatId },
          data: {
            role: invite.role,
            isActive: true,
          },
        });
        recipientId = updated.id;
        await this.audit.write({
          actor: { type: ActorType.system },
          entity: 'telegram_recipient',
          entityId: recipientId,
          action: rebound ? 'rebind' : 'invite_redeem',
          diff: {
            before: {
              role: existing.role,
              isActive: existing.isActive,
            },
            after: {
              role: updated.role,
              isActive: updated.isActive,
            },
            inviteId: invite.id,
          },
          tx,
        });
      } else {
        const created = await tx.telegramRecipient.create({
          data: {
            chatId,
            name: `Telegram ${chatId.toString()}`,
            role: invite.role,
            isActive: true,
          },
        });
        recipientId = created.id;
        await this.audit.write({
          actor: { type: ActorType.system },
          entity: 'telegram_recipient',
          entityId: recipientId,
          action: 'invite_redeem',
          diff: {
            after: {
              chatId: chatId.toString(),
              role: created.role,
              name: created.name,
            },
            inviteId: invite.id,
          },
          tx,
        });
      }

      await tx.telegramInvite.update({
        where: { id: invite.id },
        data: {
          usedAt: new Date(),
          usedByChatId: chatId,
        },
      });

      await this.audit.write({
        actor: { type: ActorType.system },
        entity: 'telegram_invite',
        entityId: invite.id,
        action: 'use',
        diff: {
          code: invite.code,
          role: invite.role,
          usedByChatId: chatId.toString(),
          recipientId,
        },
        tx,
      });

      return { role: invite.role, rebound };
    });
  }

  roleGreeting(
    role: TelegramStaffRole,
    lang: TelegramLang = 'ru',
  ): string {
    return tt(lang, 'commands.connectedAs', {
      role: telegramRoleLabel(role, lang),
    });
  }
}
