import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CategoriesRepository } from '../categories/categories.repository';
import { decimalToString } from '../common/utils/money';
import { CreatePriceTierDto } from './dto/create-price-tier.dto';
import { UpdatePriceTierDto } from './dto/update-price-tier.dto';
import { UpsertPriceTierDto } from './dto/upsert-price-tier.dto';
import { PriceTiersRepository } from './price-tiers.repository';

@Injectable()
export class PriceTiersService {
  constructor(
    private readonly priceTiersRepository: PriceTiersRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  async listMatrix() {
    const rows = await this.priceTiersRepository.findMany();
    const byCategory = new Map<
      string,
      {
        categoryId: string;
        categoryCode: string;
        categoryName: string;
        tiers: {
          id: string;
          capacity: number;
          pricePerNight: string;
        }[];
      }
    >();

    for (const row of rows) {
      let group = byCategory.get(row.categoryId);
      if (!group) {
        group = {
          categoryId: row.categoryId,
          categoryCode: row.category.code,
          categoryName: row.category.name,
          tiers: [],
        };
        byCategory.set(row.categoryId, group);
      }
      group.tiers.push({
        id: row.id,
        capacity: row.capacity,
        pricePerNight: decimalToString(row.pricePerNight),
      });
    }

    return {
      matrix: [...byCategory.values()],
      tiers: rows.map((r) => this.toView(r)),
    };
  }

  async getById(id: string) {
    const row = await this.priceTiersRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Price tier not found');
    }
    return this.toView(row);
  }

  async create(dto: CreatePriceTierDto) {
    await this.assertCategory(dto.categoryId);
    const created = await this.priceTiersRepository.create({
      capacity: dto.capacity,
      pricePerNight: new Decimal(dto.pricePerNight),
      category: { connect: { id: dto.categoryId } },
    });
    return this.getById(created.id);
  }

  async update(id: string, dto: UpdatePriceTierDto) {
    await this.getById(id);
    await this.priceTiersRepository.update(id, {
      pricePerNight: new Decimal(dto.pricePerNight),
    });
    return this.getById(id);
  }

  async upsert(dto: UpsertPriceTierDto) {
    await this.assertCategory(dto.categoryId);
    const row = await this.priceTiersRepository.upsert({
      categoryId: dto.categoryId,
      capacity: dto.capacity,
      pricePerNight: new Decimal(dto.pricePerNight),
    });
    return this.toView(row);
  }

  private async assertCategory(id: string) {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new BadRequestException('Category not found');
    }
  }

  private toView(
    row: NonNullable<Awaited<ReturnType<PriceTiersRepository['findById']>>>,
  ) {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryCode: row.category.code,
      capacity: row.capacity,
      pricePerNight: decimalToString(row.pricePerNight),
    };
  }
}
