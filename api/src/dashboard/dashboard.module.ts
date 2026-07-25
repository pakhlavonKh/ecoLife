import { Module } from '@nestjs/common';
import { DashboardAdminController } from './dashboard.admin.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardAdminController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
