import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
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

  async create(
    dto: CreatePriceTierDto,
    actor?: { type: ActorType; id?: string },
  ) {
    await this.assertCategory(dto.categoryId);
    const created = await this.priceTiersRepository.create({
      capacity: dto.capacity,
      pricePerNight: new Decimal(dto.pricePerNight),
      category: { connect: { id: dto.categoryId } },
    });
    const view = await this.getById(created.id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'price_tier',
      entityId: created.id,
      action: 'create',
      diff: { after: view },
    });
    return view;
  }

  async update(
    id: string,
    dto: UpdatePriceTierDto,
    actor?: { type: ActorType; id?: string },
  ) {
    const before = await this.getById(id);
    await this.priceTiersRepository.update(id, {
      pricePerNight: new Decimal(dto.pricePerNight),
    });
    const after = await this.getById(id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'price_tier',
      entityId: id,
      action: 'update',
      diff: { before, after },
    });
    return after;
  }

  async upsert(
    dto: UpsertPriceTierDto,
    actor?: { type: ActorType; id?: string },
  ) {
    await this.assertCategory(dto.categoryId);
    const existing = await this.priceTiersRepository.findMany();
    const before = existing.find(
      (t) =>
        t.categoryId === dto.categoryId && t.capacity === dto.capacity,
    );
    const row = await this.priceTiersRepository.upsert({
      categoryId: dto.categoryId,
      capacity: dto.capacity,
      pricePerNight: new Decimal(dto.pricePerNight),
    });
    const view = this.toView(row);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'price_tier',
      entityId: row.id,
      action: before ? 'upsert_update' : 'upsert_create',
      diff: {
        before: before
          ? {
              capacity: before.capacity,
              pricePerNight: decimalToString(before.pricePerNight),
            }
          : null,
        after: view,
      },
    });
    return view;
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
