import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** AuditService only — safe for the Telegram bot worker (no HTTP controllers). */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditCoreModule {}
