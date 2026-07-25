import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType, UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import {
  assertAllowedImageMime,
  CATEGORY_IMAGE_MAX_BYTES,
} from '../common/utils/category-images';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('admin / categories')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/categories')
export class CategoriesAdminController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all room categories' })
  list() {
    return this.categoriesService.listAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by id' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.getAdmin(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Create category (admin only)' })
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.create(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category (name, deposit %, images, …)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categoriesService.update(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Post(':id/images')
  @ApiOperation({
    summary:
      'Upload category image (JPEG/PNG/WebP/GIF, max 2MB). Safe UUID filename.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: CATEGORY_IMAGE_MAX_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        try {
          assertAllowedImageMime(file.mimetype);
          cb(null, true);
        } catch (err) {
          cb(err as Error, false);
        }
      },
    }),
  )
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Image file is required (field name: file)',
      );
    }
    return this.categoriesService.uploadImage(id, file, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
