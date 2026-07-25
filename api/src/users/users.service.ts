import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { ActorType, User, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export type UserView = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserView[]> {
    const users = await this.usersRepository.findMany();
    return users.map((u) => this.toView(u));
  }

  async getById(id: string): Promise<UserView> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toView(user);
  }

  async create(
    dto: CreateUserDto,
    actor?: { type: ActorType; id?: string },
  ): Promise<UserView> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.usersRepository.create({
      email,
      passwordHash,
      name: dto.name.trim(),
      role: dto.role,
    });

    const view = this.toView(user);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'user',
      entityId: user.id,
      action: 'create',
      diff: { after: view },
    });
    return view;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor?: { type: ActorType; id?: string },
  ): Promise<UserView> {
    const before = await this.getById(id);

    const data: Partial<{
      name: string;
      role: UserRole;
      isActive: boolean;
      passwordHash: string;
    }> = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) {
      data.passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });
    }

    const user = await this.usersRepository.update(id, data);
    const after = this.toView(user);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'user',
      entityId: id,
      action: 'update',
      diff: {
        before,
        after,
        passwordChanged: dto.password !== undefined,
      },
    });
    return after;
  }

  private toView(user: User): UserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
