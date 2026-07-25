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
import { CottagesService } from './cottages.service';
import { CreateCottageDto } from './dto/create-cottage.dto';
import { UpdateCottageDto } from './dto/update-cottage.dto';

@ApiTags('admin / cottages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/cottages')
export class CottagesAdminController {
  constructor(private readonly cottagesService: CottagesService) {}

  @Get()
  @ApiOperation({ summary: 'List cottages' })
  list() {
    return this.cottagesService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get cottage with rooms' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cottagesService.getById(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Create cottage (admin only)' })
  create(@Body() dto: CreateCottageDto, @CurrentUser() user: RequestUser) {
    return this.cottagesService.create(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update cottage' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCottageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cottagesService.update(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
