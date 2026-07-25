import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TelegramBotService } from './telegram.bot.service';
import { TelegramNotifyService } from './telegram.notify.service';
import { TelegramQueueService } from './telegram.queue.service';

@Module({
  imports: [DashboardModule],
  providers: [
    TelegramQueueService,
    TelegramBotService,
    TelegramNotifyService,
  ],
})
export class TelegramModule {}
