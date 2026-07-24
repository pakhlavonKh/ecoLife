import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType, BookingStatus, UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { BookingsService } from './bookings.service';
import { TransitionStatusDto } from './dto/transition-status.dto';

class ListBookingsQueryDto {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

@ApiTags('admin / bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/bookings')
export class BookingsAdminController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'List bookings (search + status filter)' })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'search', required: false })
  list(@Query() query: ListBookingsQueryDto) {
    return this.bookingsService.listAdmin({
      status: query.status,
      search: query.search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking by id' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.getById(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Transition booking status (illegal transitions → 422). Releases inventory on cancel/check-out.',
  })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.transitionStatus(id, dto.status, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
