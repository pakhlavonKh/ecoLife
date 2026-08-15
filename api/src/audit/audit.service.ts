import { Injectable } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditActor = {
  type: ActorType;
  id?: string | null;
};

export type WriteAuditInput = {
  actor: AuditActor;
  entity: string;
  entityId: string;
  action: string;
  diff?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: WriteAuditInput) {
    const db = input.tx ?? this.prisma;
    return db.auditLog.create({
      data: {
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        diff: input.diff ?? Prisma.JsonNull,
      },
    });
  }

  async list(filters: {
    entity?: string;
    entityId?: string;
    actorType?: ActorType;
    action?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.entity) {
      where.entity = filters.entity;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }
    if (filters.actorType) {
      where.actorType = filters.actorType;
    }
    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.limit ?? 200, 500),
    });

    return rows.map((row) => ({
      id: row.id,
      actorType: row.actorType,
      actorId: row.actorId,
      entity: row.entity,
      entityId: row.entityId,
      action: row.action,
      diff: row.diff,
      createdAt: row.createdAt,
    }));
  }

  async delete(id: string) {
    return this.prisma.auditLog.delete({
      where: { id },
    });
  }

  async clearAll() {
    return this.prisma.auditLog.deleteMany({});
  }
}
