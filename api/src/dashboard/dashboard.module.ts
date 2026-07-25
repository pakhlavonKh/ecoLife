import { Module } from '@nestjs/common';
import { DashboardAdminController } from './dashboard.admin.controller';
import { DashboardCoreModule } from './dashboard-core.module';

@Module({
  imports: [DashboardCoreModule],
  controllers: [DashboardAdminController],
  exports: [DashboardCoreModule],
})
export class DashboardModule {}
