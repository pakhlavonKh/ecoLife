import { Injectable } from '@nestjs/common';
import { Cottage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CottagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(where?: Prisma.CottageWhereInput) {
    return this.prisma.cottage.findMany({
      where,
      include: {
        _count: { select: { rooms: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.cottage.findUnique({
      where: { id },
      include: {
        rooms: {
          orderBy: { number: 'asc' },
          include: { category: true },
        },
      },
    });
  }

  create(data: Prisma.CottageCreateInput): Promise<Cottage> {
    return this.prisma.cottage.create({ data });
  }

  update(id: string, data: Prisma.CottageUpdateInput): Promise<Cottage> {
    return this.prisma.cottage.update({ where: { id }, data });
  }
}
