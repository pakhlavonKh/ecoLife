import { Module } from '@nestjs/common';
import { AvailabilityAdminController } from './availability.admin.controller';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  controllers: [AvailabilityController, AvailabilityAdminController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
