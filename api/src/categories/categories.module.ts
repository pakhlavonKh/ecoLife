import { Module } from '@nestjs/common';
import { CategoriesAdminController } from './categories.admin.controller';
import { CategoriesPublicController } from './categories.public.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesAdminController, CategoriesPublicController],
  providers: [CategoriesRepository, CategoriesService],
  exports: [CategoriesRepository, CategoriesService],
})
export class CategoriesModule {}
