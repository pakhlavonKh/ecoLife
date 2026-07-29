import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MealForecastQueryDto } from './dto/meal-forecast-query.dto';
import { MealForecastService } from './meal-forecast.service';

@ApiTags('admin / exports')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard)
@Controller('admin/exports')
export class ExportsAdminController {
  constructor(private readonly meals: MealForecastService) {}

  @Get('meal-forecast')
  @ApiOperation({
    summary:
      'Meal forecast for the restaurant (xlsx/pdf). Counts guests at breakfast/lunch/dinner by stay datetime.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-08-07' })
  @ApiQuery({ name: 'format', required: true, enum: ['xlsx', 'pdf'] })
  @ApiQuery({
    name: 'include_pending',
    required: false,
    description: 'Include unpaid pending_payment holds (default false)',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @Header('Cache-Control', 'no-store')
  async downloadMealForecast(
    @Query() query: MealForecastQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, filename } = await this.meals.buildExport({
      from: query.from,
      to: query.to,
      format: query.format,
      includePending: query.include_pending === true,
    });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return file;
  }
}
