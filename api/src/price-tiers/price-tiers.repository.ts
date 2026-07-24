import { Injectable } from '@nestjs/common';
import { Prisma, PriceTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceTiersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(where?: Prisma.PriceTierWhereInput) {
    return this.prisma.priceTier.findMany({
      where,
      include: { category: true },
      orderBy: [{ category: { code: 'asc' } }, { capacity: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.priceTier.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  findByCategoryCapacity(categoryId: string, capacity: number) {
    return this.prisma.priceTier.findUnique({
      where: { categoryId_capacity: { categoryId, capacity } },
    });
  }

  create(data: Prisma.PriceTierCreateInput): Promise<PriceTier> {
    return this.prisma.priceTier.create({ data });
  }

  update(id: string, data: Prisma.PriceTierUpdateInput): Promise<PriceTier> {
    return this.prisma.priceTier.update({ where: { id }, data });
  }

  upsert(params: {
    categoryId: string;
    capacity: number;
    pricePerNight: Prisma.Decimal | string;
  }) {
    return this.prisma.priceTier.upsert({
      where: {
        categoryId_capacity: {
          categoryId: params.categoryId,
          capacity: params.capacity,
        },
      },
      create: {
        capacity: params.capacity,
        pricePerNight: params.pricePerNight,
        category: { connect: { id: params.categoryId } },
      },
      update: {
        pricePerNight: params.pricePerNight,
      },
      include: { category: true },
    });
  }
}
