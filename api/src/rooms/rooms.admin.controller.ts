import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { ActorType, UserRole } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

class ListRoomsQueryDto {
  @IsOptional()
  @IsUUID()
  cottageId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

@ApiTags('admin / rooms')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/rooms')
export class RoomsAdminController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'List rooms (optional cottage/category filter)' })
  @ApiQuery({ name: 'cottageId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  list(@Query() query: ListRoomsQueryDto) {
    return this.roomsService.list({
      cottageId: query.cottageId,
      categoryId: query.categoryId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room by id' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.roomsService.getById(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Create room (admin only)' })
  create(@Body() dto: CreateRoomDto, @CurrentUser() user: RequestUser) {
    return this.roomsService.create(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update room (capacity, category, price override, …)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.roomsService.update(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
