import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { RoomLocksAdminController } from './room-locks.admin.controller';
import { RoomLocksService } from './room-locks.service';

@Module({
  imports: [AvailabilityModule],
  controllers: [RoomLocksAdminController],
  providers: [RoomLocksService],
  exports: [RoomLocksService],
})
export class RoomLocksModule {}
