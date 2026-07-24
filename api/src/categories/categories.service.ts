import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoomCategory } from '@prisma/client';
import { decimalToString } from '../common/utils/money';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type CategoryWithTiers = RoomCategory & {
  priceTiers: { capacity: number; pricePerNight: { toFixed(n: number): string } | string | number }[];
};

export type AdminCategoryView = {
  id: string;
  code: string;
  name: string;
  description: string;
  depositPercent: number;
  images: string[];
  isActive: boolean;
  priceTiers: { capacity: number; pricePerNight: string }[];
  createdAt: Date;
  updatedAt: Date;
};

export type PublicCategoryView = {
  id: string;
  code: string;
  name: string;
  description: string;
  depositPercent: number;
  images: string[];
  priceFrom: string | null;
  priceTo: string | null;
};

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async listAdmin(): Promise<AdminCategoryView[]> {
    const rows = await this.categoriesRepository.findMany();
    return rows.map((r) => this.toAdminView(r));
  }

  async getAdmin(id: string): Promise<AdminCategoryView> {
    const row = await this.categoriesRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Category not found');
    }
    return this.toAdminView(row);
  }

  async listPublic(): Promise<PublicCategoryView[]> {
    const rows = await this.categoriesRepository.findMany({ isActive: true });
    return rows.map((r) => this.toPublicView(r));
  }

  async create(dto: CreateCategoryDto): Promise<AdminCategoryView> {
    const code = dto.code.trim().toLowerCase();
    const existing = await this.categoriesRepository.findByCode(code);
    if (existing) {
      throw new ConflictException(`Category code "${code}" already exists`);
    }

    const created = await this.categoriesRepository.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      depositPercent: dto.depositPercent,
      images: dto.images ?? [],
      isActive: dto.isActive ?? true,
    });

    const full = await this.categoriesRepository.findById(created.id);
    return this.toAdminView(full!);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<AdminCategoryView> {
    await this.getAdmin(id);

    await this.categoriesRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.depositPercent !== undefined
        ? { depositPercent: dto.depositPercent }
        : {}),
      ...(dto.images !== undefined ? { images: dto.images } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    return this.getAdmin(id);
  }

  private toAdminView(row: CategoryWithTiers): AdminCategoryView {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      depositPercent: row.depositPercent,
      images: row.images,
      isActive: row.isActive,
      priceTiers: row.priceTiers.map((t) => ({
        capacity: t.capacity,
        pricePerNight: decimalToString(t.pricePerNight as never),
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toPublicView(row: CategoryWithTiers): PublicCategoryView {
    const prices = row.priceTiers.map((t) =>
      Number(decimalToString(t.pricePerNight as never)),
    );
    const priceFrom =
      prices.length > 0 ? Math.min(...prices).toFixed(2) : null;
    const priceTo =
      prices.length > 0 ? Math.max(...prices).toFixed(2) : null;

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      depositPercent: row.depositPercent,
      images: row.images,
      priceFrom,
      priceTo,
    };
  }
}
