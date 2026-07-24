import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { PriceTiersAdminController } from './price-tiers.admin.controller';
import { PriceTiersRepository } from './price-tiers.repository';
import { PriceTiersService } from './price-tiers.service';

@Module({
  imports: [CategoriesModule],
  controllers: [PriceTiersAdminController],
  providers: [PriceTiersRepository, PriceTiersService],
  exports: [PriceTiersRepository, PriceTiersService],
})
export class PriceTiersModule {}
