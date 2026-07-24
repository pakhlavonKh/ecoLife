import { Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findMany(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: {
    email: string;
    passwordHash: string;
    name: string;
    role: UserRole;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  update(
    id: string,
    data: Partial<{
      name: string;
      role: UserRole;
      isActive: boolean;
      passwordHash: string;
    }>,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }
}
