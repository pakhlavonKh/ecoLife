import { Module } from '@nestjs/common';
import { CottagesAdminController } from './cottages.admin.controller';
import { CottagesRepository } from './cottages.repository';
import { CottagesService } from './cottages.service';

@Module({
  controllers: [CottagesAdminController],
  providers: [CottagesRepository, CottagesService],
  exports: [CottagesRepository, CottagesService],
})
export class CottagesModule {}
