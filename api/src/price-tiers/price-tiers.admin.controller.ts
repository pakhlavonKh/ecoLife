import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { ActorType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { CreatePriceTierDto } from './dto/create-price-tier.dto';
import { UpdatePriceTierDto } from './dto/update-price-tier.dto';
import { UpsertPriceTierDto } from './dto/upsert-price-tier.dto';
import { PriceTiersService } from './price-tiers.service';

@ApiTags('admin / price-tiers')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin/price-tiers')
export class PriceTiersAdminController {
  constructor(private readonly priceTiersService: PriceTiersService) {}

  @Get()
  @ApiOperation({
    summary: 'Price matrix (category × capacity) + flat tier list',
  })
  list() {
    return this.priceTiersService.listMatrix();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get price tier by id' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceTiersService.getById(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Create price tier (admin only)' })
  create(
    @Body() dto: CreatePriceTierDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceTiersService.create(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Put()
  @ApiOperation({
    summary: 'Upsert price for category × capacity (matrix cell editor)',
  })
  upsert(
    @Body() dto: UpsertPriceTierDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceTiersService.upsert(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update price_per_night of an existing tier' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceTierDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceTiersService.update(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
