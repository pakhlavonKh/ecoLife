import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  TelegramLanguage,
  TelegramRecipient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTelegramRecipientDto } from './dto/update-telegram-recipient.dto';

export type TelegramRecipientView = {
  id: string;
  chatId: string;
  name: string;
  role: TelegramRecipient['role'];
  language: TelegramLanguage;
  isActive: boolean;
  mutedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TelegramRecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  toView(row: TelegramRecipient): TelegramRecipientView {
    return {
      id: row.id,
      chatId: row.chatId.toString(),
      name: row.name,
      role: row.role,
      language: row.language,
      isActive: row.isActive,
      mutedUntil: row.mutedUntil,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(): Promise<TelegramRecipientView[]> {
    const rows = await this.prisma.telegramRecipient.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async getById(id: string): Promise<TelegramRecipientView> {
    const row = await this.prisma.telegramRecipient.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Получатель не найден');
    }
    return this.toView(row);
  }

  async findByChatId(chatId: bigint): Promise<TelegramRecipient | null> {
    return this.prisma.telegramRecipient.findUnique({ where: { chatId } });
  }

  async setLanguageByChatId(
    chatId: bigint,
    language: TelegramLanguage,
  ): Promise<TelegramRecipient | null> {
    const existing = await this.findByChatId(chatId);
    if (!existing) {
      return null;
    }
    return this.prisma.telegramRecipient.update({
      where: { chatId },
      data: { language },
    });
  }

  async update(
    id: string,
    dto: UpdateTelegramRecipientDto,
    actor: { type: ActorType; id?: string },
  ): Promise<TelegramRecipientView> {
    const before = await this.getById(id);
    const updated = await this.prisma.telegramRecipient.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    const after = this.toView(updated);
    await this.audit.write({
      actor,
      entity: 'telegram_recipient',
      entityId: id,
      action: 'update',
      diff: { before, after },
    });
    return after;
  }

  async remove(
    id: string,
    actor: { type: ActorType; id?: string },
  ): Promise<{ ok: true }> {
    const before = await this.getById(id);
    await this.prisma.telegramRecipient.delete({ where: { id } });
    await this.audit.write({
      actor,
      entity: 'telegram_recipient',
      entityId: id,
      action: 'delete',
      diff: { before },
    });
    return { ok: true };
  }

  /**
   * Idempotent: upsert each TELEGRAM_ADMIN_CHAT_IDS entry as role=admin.
   * Called from seed and on bot module init (Phase A §8).
   */
  async migrateEnvChatIds(rawIds: string): Promise<number> {
    const ids = rawIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let created = 0;
    for (const id of ids) {
      let chatId: bigint;
      try {
        chatId = BigInt(id);
      } catch {
        continue;
      }

      const existing = await this.prisma.telegramRecipient.findUnique({
        where: { chatId },
      });
      if (existing) {
        continue;
      }

      const row = await this.prisma.telegramRecipient.create({
        data: {
          chatId,
          name: 'Migrated from env',
          role: 'admin',
          isActive: true,
        },
      });
      created += 1;
      await this.audit.write({
        actor: { type: ActorType.system },
        entity: 'telegram_recipient',
        entityId: row.id,
        action: 'migrate_from_env',
        diff: { after: this.toView(row) },
      });
    }
    return created;
  }

  async countActive(): Promise<number> {
    return this.prisma.telegramRecipient.count({ where: { isActive: true } });
  }

  /**
   * Auto-deactivate after Telegram 403 (bot blocked / chat forbidden).
   * Idempotent; writes audit_log.
   */
  async deactivateBlockedChat(chatId: string): Promise<boolean> {
    let id: bigint;
    try {
      id = BigInt(chatId);
    } catch {
      return false;
    }

    const row = await this.prisma.telegramRecipient.findUnique({
      where: { chatId: id },
    });
    if (!row || !row.isActive) {
      return false;
    }

    const before = this.toView(row);
    const updated = await this.prisma.telegramRecipient.update({
      where: { id: row.id },
      data: { isActive: false },
    });
    const after = this.toView(updated);
    await this.audit.write({
      actor: { type: ActorType.system },
      entity: 'telegram_recipient',
      entityId: row.id,
      action: 'auto_deactivate_blocked',
      diff: { before, after, reason: 'telegram_403' },
    });
    return true;
  }
}
