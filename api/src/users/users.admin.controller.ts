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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('admin / users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user' })
  me(@CurrentUser() user: RequestUser) {
    return this.usersService.getById(user.id);
  }

  @Get()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'List all admin/manager users (admin only)' })
  list() {
    return this.usersService.list();
  }

  @Get(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Get user by id (admin only)' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getById(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Create admin/manager user (admin only)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Update user (admin only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }
}
