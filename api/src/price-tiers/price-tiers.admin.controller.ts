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
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreatePriceTierDto } from './dto/create-price-tier.dto';
import { UpdatePriceTierDto } from './dto/update-price-tier.dto';
import { UpsertPriceTierDto } from './dto/upsert-price-tier.dto';
import { PriceTiersService } from './price-tiers.service';

@ApiTags('admin / price-tiers')
@ApiBearerAuth()
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
  create(@Body() dto: CreatePriceTierDto) {
    return this.priceTiersService.create(dto);
  }

  @Put()
  @ApiOperation({
    summary: 'Upsert price for category × capacity (matrix cell editor)',
  })
  upsert(@Body() dto: UpsertPriceTierDto) {
    return this.priceTiersService.upsert(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update price_per_night of an existing tier' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceTierDto,
  ) {
    return this.priceTiersService.update(id, dto);
  }
}
