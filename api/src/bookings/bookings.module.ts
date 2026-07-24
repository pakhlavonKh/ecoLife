import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsAdminController } from './bookings.admin.controller';
import { BookingsPublicController } from './bookings.public.controller';
import { BookingsService } from './bookings.service';
import { HoldExpiryWorker } from './hold-expiry.worker';

@Module({
  imports: [AvailabilityModule, PaymentsModule],
  controllers: [BookingsPublicController, BookingsAdminController],
  providers: [BookingsService, HoldExpiryWorker],
  exports: [BookingsService],
})
export class BookingsModule {}
