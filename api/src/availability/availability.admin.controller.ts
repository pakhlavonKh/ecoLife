import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

@ApiTags('admin / availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/availability')
export class AvailabilityAdminController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary:
      'Admin availability with per-category available_rooms[] {number, capacity, price}',
  })
  get(@Query() query: AvailabilityQueryDto) {
    return this.availabilityService.getAdminAvailability(
      query.check_in,
      query.check_out,
    );
  }
}
