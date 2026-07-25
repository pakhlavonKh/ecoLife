import { Module } from '@nestjs/common';
import { DashboardCoreModule } from '../dashboard/dashboard-core.module';
import { TelegramBotService } from './telegram.bot.service';
import { TelegramNotifyService } from './telegram.notify.service';
import { TelegramQueueService } from './telegram.queue.service';

@Module({
  imports: [DashboardCoreModule],
  providers: [
    TelegramQueueService,
    TelegramBotService,
    TelegramNotifyService,
  ],
})
export class TelegramModule {}
