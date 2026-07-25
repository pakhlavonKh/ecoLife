import { Module } from '@nestjs/common';
import { AuditCoreModule } from '../audit/audit-core.module';
import { DashboardCoreModule } from '../dashboard/dashboard-core.module';
import { TelegramAdminController } from './telegram.admin.controller';
import { TelegramBotService } from './telegram.bot.service';
import { TelegramInvitesService } from './telegram-invites.service';
import { TelegramNotifyService } from './telegram.notify.service';
import { TelegramQueueService } from './telegram.queue.service';
import { TelegramRecipientsService } from './telegram-recipients.service';

@Module({
  imports: [DashboardCoreModule, AuditCoreModule],
  controllers: [TelegramAdminController],
  providers: [
    TelegramQueueService,
    TelegramBotService,
    TelegramNotifyService,
    TelegramRecipientsService,
    TelegramInvitesService,
  ],
  exports: [TelegramRecipientsService, TelegramInvitesService],
})
export class TelegramModule {}
