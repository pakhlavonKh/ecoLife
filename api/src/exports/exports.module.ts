import { Module } from '@nestjs/common';
import { ExportsAdminController } from './exports.admin.controller';
import { MealForecastService } from './meal-forecast.service';

@Module({
  controllers: [ExportsAdminController],
  providers: [MealForecastService],
  exports: [MealForecastService],
})
export class ExportsModule {}
