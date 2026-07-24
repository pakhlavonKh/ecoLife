import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

@Injectable()
export class HoldExpiryWorker {
  private readonly logger = new Logger(HoldExpiryWorker.name);
  private running = false;

  constructor(private readonly bookingsService: BookingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const count = await this.bookingsService.expireHolds();
      if (count > 0) {
        this.logger.log(`Expired ${count} pending_payment hold(s)`);
      }
    } catch (error) {
      this.logger.error(
        { err: error },
        'Failed to expire pending_payment holds',
      );
    } finally {
      this.running = false;
    }
  }
}
