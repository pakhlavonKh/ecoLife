import { Global, Module } from '@nestjs/common';
import { AuditAdminController } from './audit.admin.controller';
import { AuditService } from './audit.service';

@Global()
@Module({
  controllers: [AuditAdminController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
