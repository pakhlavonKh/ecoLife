import { Module } from '@nestjs/common';
import { CustomersAdminController } from './customers.admin.controller';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersAdminController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
