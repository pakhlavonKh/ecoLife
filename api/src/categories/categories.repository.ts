import { Injectable } from '@nestjs/common';
import { Prisma, RoomCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(where?: Prisma.RoomCategoryWhereInput) {
    return this.prisma.roomCategory.findMany({
      where,
      include: { priceTiers: { orderBy: { capacity: 'asc' } } },
      orderBy: { code: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.roomCategory.findUnique({
      where: { id },
      include: { priceTiers: { orderBy: { capacity: 'asc' } } },
    });
  }

  findByCode(code: string) {
    return this.prisma.roomCategory.findUnique({ where: { code } });
  }

  create(data: Prisma.RoomCategoryCreateInput): Promise<RoomCategory> {
    return this.prisma.roomCategory.create({ data });
  }

  update(id: string, data: Prisma.RoomCategoryUpdateInput): Promise<RoomCategory> {
    return this.prisma.roomCategory.update({ where: { id }, data });
  }
}
