import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsersAdminController } from './users.admin.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [AuditModule],
  controllers: [UsersAdminController],
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
