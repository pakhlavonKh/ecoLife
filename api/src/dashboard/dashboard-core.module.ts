import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/** Service-only module (safe for the Telegram bot worker). */
@Module({
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardCoreModule {}
