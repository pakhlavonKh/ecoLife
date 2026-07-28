import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType, UserRole } from '@prisma/client';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { CreateRoomLockDto } from './dto/create-room-lock.dto';
import { ListRoomLocksQueryDto } from './dto/list-room-locks-query.dto';
import { RoomLocksService } from './room-locks.service';

@ApiTags('admin / room-locks')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/room-locks')
export class RoomLocksAdminController {
  constructor(private readonly roomLocks: RoomLocksService) {}

  @Get()
  @ApiOperation({ summary: 'List room locks (filter by range / room / booking)' })
  list(@Query() query: ListRoomLocksQueryDto) {
    return this.roomLocks.list({
      from: query.from,
      to: query.to,
      roomId: query.roomId,
      bookingId: query.bookingId,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Lock a room whole for dates (no further bed bookings)',
  })
  create(
    @Body() dto: CreateRoomLockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.roomLocks.create(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
