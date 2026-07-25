import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CottagesRepository } from './cottages.repository';
import { CreateCottageDto } from './dto/create-cottage.dto';
import { UpdateCottageDto } from './dto/update-cottage.dto';

@Injectable()
export class CottagesService {
  constructor(
    private readonly cottagesRepository: CottagesRepository,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.cottagesRepository.findMany();
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      roomsCount: c._count.rooms,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getById(id: string) {
    const cottage = await this.cottagesRepository.findById(id);
    if (!cottage) {
      throw new NotFoundException('Cottage not found');
    }

    return {
      id: cottage.id,
      name: cottage.name,
      sortOrder: cottage.sortOrder,
      isActive: cottage.isActive,
      createdAt: cottage.createdAt,
      updatedAt: cottage.updatedAt,
      rooms: cottage.rooms.map((r) => ({
        id: r.id,
        number: r.number,
        capacity: r.capacity,
        categoryId: r.categoryId,
        categoryCode: r.category.code,
        isActive: r.isActive,
      })),
    };
  }

  async create(
    dto: CreateCottageDto,
    actor?: { type: ActorType; id?: string },
  ) {
    const created = await this.cottagesRepository.create({
      name: dto.name.trim(),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    const view = await this.getById(created.id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'cottage',
      entityId: created.id,
      action: 'create',
      diff: { after: view },
    });
    return view;
  }

  async update(
    id: string,
    dto: UpdateCottageDto,
    actor?: { type: ActorType; id?: string },
  ) {
    const before = await this.getById(id);
    await this.cottagesRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    const after = await this.getById(id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'cottage',
      entityId: id,
      action: 'update',
      diff: { before, after },
    });
    return after;
  }
}
