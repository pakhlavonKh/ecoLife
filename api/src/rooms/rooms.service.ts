import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { decimalToString } from '../common/utils/money';
import { CategoriesRepository } from '../categories/categories.repository';
import { CottagesRepository } from '../cottages/cottages.repository';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsRepository } from './rooms.repository';

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly cottagesRepository: CottagesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly audit: AuditService,
  ) {}

  async list(filters?: { cottageId?: string; categoryId?: string }) {
    const rows = await this.roomsRepository.findMany({
      ...(filters?.cottageId ? { cottageId: filters.cottageId } : {}),
      ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
    });

    return rows.map((r) => this.toView(r));
  }

  async getById(id: string) {
    const room = await this.roomsRepository.findById(id);
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return this.toView(room);
  }

  async create(
    dto: CreateRoomDto,
    actor?: { type: ActorType; id?: string },
  ) {
    const number = dto.number.trim();
    const existing = await this.roomsRepository.findByNumber(number);
    if (existing) {
      throw new ConflictException(`Room number "${number}" already exists`);
    }

    await this.assertCottage(dto.cottageId);
    await this.assertCategory(dto.categoryId);

    const created = await this.roomsRepository.create({
      number,
      capacity: dto.capacity,
      isActive: dto.isActive ?? true,
      cottage: { connect: { id: dto.cottageId } },
      category: { connect: { id: dto.categoryId } },
    });

    const view = await this.getById(created.id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'room',
      entityId: created.id,
      action: 'create',
      diff: { after: view },
    });
    return view;
  }

  async update(
    id: string,
    dto: UpdateRoomDto,
    actor?: { type: ActorType; id?: string },
  ) {
    const current = await this.roomsRepository.findById(id);
    if (!current) {
      throw new NotFoundException('Room not found');
    }
    const before = await this.getById(id);

    if (dto.number !== undefined) {
      const number = dto.number.trim();
      const clash = await this.roomsRepository.findByNumber(number);
      if (clash && clash.id !== id) {
        throw new ConflictException(`Room number "${number}" already exists`);
      }
    }

    if (dto.cottageId !== undefined) {
      await this.assertCottage(dto.cottageId);
    }
    if (dto.categoryId !== undefined) {
      await this.assertCategory(dto.categoryId);
    }

    await this.roomsRepository.update(id, {
      ...(dto.number !== undefined ? { number: dto.number.trim() } : {}),
      ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      ...(dto.cottageId !== undefined
        ? { cottage: { connect: { id: dto.cottageId } } }
        : {}),
      ...(dto.categoryId !== undefined
        ? { category: { connect: { id: dto.categoryId } } }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    const after = await this.getById(id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'room',
      entityId: id,
      action: 'update',
      diff: { before, after },
    });
    return after;
  }

  private async assertCottage(id: string) {
    const cottage = await this.cottagesRepository.findById(id);
    if (!cottage) {
      throw new BadRequestException('Cottage not found');
    }
  }

  private async assertCategory(id: string) {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new BadRequestException('Category not found');
    }
  }

  private toView(
    room: NonNullable<Awaited<ReturnType<RoomsRepository['findById']>>>,
  ) {
    const resolvedPrice = decimalToString(room.category.pricePerBedPerNight);

    return {
      id: room.id,
      number: room.number,
      capacity: room.capacity,
      cottageId: room.cottageId,
      cottageName: room.cottage.name,
      categoryId: room.categoryId,
      categoryCode: room.category.code,
      pricePerBedPerNight: resolvedPrice,
      resolvedPrice,
      bookable: room.isActive,
      isActive: room.isActive,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }
}
