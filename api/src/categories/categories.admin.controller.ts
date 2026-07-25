import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('admin / categories')
@ApiBearerAuth()
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
}
