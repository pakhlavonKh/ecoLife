import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ActorType, RoomCategory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../audit/audit.service';
import {
  assertAllowedImageMime,
  assertSafeCategoryImages,
  buildSafeCategoryImageFilename,
  CATEGORY_IMAGE_MAX_BYTES,
  CATEGORY_IMAGES_MAX_COUNT,
} from '../common/utils/category-images';
import { decimalToString } from '../common/utils/money';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export type AdminCategoryView = {
  id: string;
  code: string;
  name: string;
  description: string;
  depositPercent: number;
  priceAdult: string;
  priceChild: string;
  priceInfant: string;
  /** @deprecated alias of priceAdult for older clients */
  pricePerBedPerNight: string;
  images: string[];
  isActive: boolean;
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
  priceAdult: string;
  priceChild: string;
  priceInfant: string;
  /** @deprecated alias of priceAdult */
  pricePerBedPerNight: string;
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly audit: AuditService,
  ) {}

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

  async create(
    dto: CreateCategoryDto,
    actor?: { type: ActorType; id?: string },
  ): Promise<AdminCategoryView> {
    const code = dto.code.trim().toLowerCase();
    const existing = await this.categoriesRepository.findByCode(code);
    if (existing) {
      throw new ConflictException(`Category code "${code}" already exists`);
    }

    const images = assertSafeCategoryImages(dto.images) ?? [];

    const created = await this.categoriesRepository.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      depositPercent: dto.depositPercent,
      priceAdult: new Decimal(dto.priceAdult),
      priceChild: new Decimal(dto.priceChild),
      priceInfant: new Decimal(dto.priceInfant),
      images,
      isActive: dto.isActive ?? true,
    });

    const full = await this.categoriesRepository.findById(created.id);
    const view = this.toAdminView(full!);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'category',
      entityId: created.id,
      action: 'create',
      diff: { after: view },
    });
    return view;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    actor?: { type: ActorType; id?: string },
  ): Promise<AdminCategoryView> {
    const before = await this.getAdmin(id);
    const images = assertSafeCategoryImages(dto.images);

    await this.categoriesRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.depositPercent !== undefined
        ? { depositPercent: dto.depositPercent }
        : {}),
      ...(dto.priceAdult !== undefined
        ? { priceAdult: new Decimal(dto.priceAdult) }
        : {}),
      ...(dto.priceChild !== undefined
        ? { priceChild: new Decimal(dto.priceChild) }
        : {}),
      ...(dto.priceInfant !== undefined
        ? { priceInfant: new Decimal(dto.priceInfant) }
        : {}),
      ...(images !== undefined ? { images } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    const after = await this.getAdmin(id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'category',
      entityId: id,
      action: 'update',
      diff: { before, after },
    });
    return after;
  }

  /**
   * Store an uploaded category image under uploads/categories/ with a safe
   * UUID filename; append path to category.images and audit.
   */
  async uploadImage(
    id: string,
    file: Express.Multer.File | undefined,
    actor?: { type: ActorType; id?: string },
  ): Promise<AdminCategoryView> {
    if (!file) {
      throw new BadRequestException('Image file is required (field name: file)');
    }
    if (file.size > CATEGORY_IMAGE_MAX_BYTES) {
      throw new BadRequestException(
        `Image must be at most ${CATEGORY_IMAGE_MAX_BYTES} bytes`,
      );
    }

    const mime = assertAllowedImageMime(file.mimetype);
    const before = await this.getAdmin(id);
    if (before.images.length >= CATEGORY_IMAGES_MAX_COUNT) {
      throw new BadRequestException(
        `At most ${CATEGORY_IMAGES_MAX_COUNT} images allowed`,
      );
    }

    const filename = buildSafeCategoryImageFilename(mime);
    const dir = join(process.cwd(), 'uploads', 'categories');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), file.buffer);

    const publicPath = `/uploads/categories/${filename}`;
    const images = [...before.images, publicPath];

    await this.categoriesRepository.update(id, { images });
    const after = await this.getAdmin(id);
    await this.audit.write({
      actor: actor ?? { type: ActorType.admin },
      entity: 'category',
      entityId: id,
      action: 'image_upload',
      diff: { before, after, uploaded: publicPath },
    });
    return after;
  }

  private toAdminView(row: RoomCategory): AdminCategoryView {
    const priceAdult = decimalToString(row.priceAdult);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      depositPercent: row.depositPercent,
      priceAdult,
      priceChild: decimalToString(row.priceChild),
      priceInfant: decimalToString(row.priceInfant),
      pricePerBedPerNight: priceAdult,
      images: row.images,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toPublicView(row: RoomCategory): PublicCategoryView {
    const priceAdult = decimalToString(row.priceAdult);
    const priceChild = decimalToString(row.priceChild);
    const priceInfant = decimalToString(row.priceInfant);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      depositPercent: row.depositPercent,
      images: row.images,
      priceFrom: priceAdult,
      priceTo: priceAdult,
      priceAdult,
      priceChild,
      priceInfant,
      pricePerBedPerNight: priceAdult,
    };
  }
}
