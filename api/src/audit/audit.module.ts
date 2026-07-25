import { Global, Module } from '@nestjs/common';
import { AuditAdminController } from './audit.admin.controller';
import { AuditCoreModule } from './audit-core.module';

@Global()
@Module({
  imports: [AuditCoreModule],
  controllers: [AuditAdminController],
  exports: [AuditCoreModule],
})
export class AuditModule {}
