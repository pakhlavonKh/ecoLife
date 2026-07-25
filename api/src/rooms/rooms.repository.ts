import { Injectable } from '@nestjs/common';
import { Prisma, Room } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(where?: Prisma.RoomWhereInput) {
    return this.prisma.room.findMany({
      where,
      include: {
        cottage: true,
        category: true,
        // resolve tier via categoryId + capacity later in service
      },
      orderBy: [
        { cottage: { sortOrder: 'asc' } },
        { number: 'asc' },
      ],
    });
  }

  findById(id: string) {
    return this.prisma.room.findUnique({
      where: { id },
      include: { cottage: true, category: true },
    });
  }

  findByNumber(number: string) {
    return this.prisma.room.findUnique({ where: { number } });
  }

  create(data: Prisma.RoomCreateInput): Promise<Room> {
    return this.prisma.room.create({ data });
  }

  update(id: string, data: Prisma.RoomUpdateInput): Promise<Room> {
    return this.prisma.room.update({ where: { id }, data });
  }

  findPriceTier(categoryId: string, capacity: number) {
    return this.prisma.priceTier.findUnique({
      where: {
        categoryId_capacity: { categoryId, capacity },
      },
    });
  }
}
