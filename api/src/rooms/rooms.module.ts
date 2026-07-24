import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { CottagesModule } from '../cottages/cottages.module';
import { RoomsAdminController } from './rooms.admin.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  imports: [CottagesModule, CategoriesModule],
  controllers: [RoomsAdminController],
  providers: [RoomsRepository, RoomsService],
  exports: [RoomsRepository, RoomsService],
})
export class RoomsModule {}
