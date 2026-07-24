import { Injectable, NotFoundException } from '@nestjs/common';
import { CottagesRepository } from './cottages.repository';
import { CreateCottageDto } from './dto/create-cottage.dto';
import { UpdateCottageDto } from './dto/update-cottage.dto';

@Injectable()
export class CottagesService {
  constructor(private readonly cottagesRepository: CottagesRepository) {}

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

  async create(dto: CreateCottageDto) {
    const created = await this.cottagesRepository.create({
      name: dto.name.trim(),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.getById(created.id);
  }

  async update(id: string, dto: UpdateCottageDto) {
    await this.getById(id);
    await this.cottagesRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    return this.getById(id);
  }
}
