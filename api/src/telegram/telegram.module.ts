import { Module } from '@nestjs/common';
import { AuditCoreModule } from '../audit/audit-core.module';
import { DashboardCoreModule } from '../dashboard/dashboard-core.module';
import { NotificationRulesService } from './notification-rules.service';
import { TelegramAdminController } from './telegram.admin.controller';
import { TelegramBotService } from './telegram.bot.service';
import { TelegramDigestWorker } from './telegram.digest.worker';
import { TelegramInvitesService } from './telegram-invites.service';
import { TelegramNotifyService } from './telegram.notify.service';
import { TelegramQueueService } from './telegram.queue.service';
import { TelegramRecipientsService } from './telegram-recipients.service';
import { TelegramRouterService } from './telegram.router.service';

@Module({
  imports: [DashboardCoreModule, AuditCoreModule],
  controllers: [TelegramAdminController],
  providers: [
    TelegramQueueService,
    TelegramBotService,
    TelegramNotifyService,
    TelegramDigestWorker,
    TelegramRecipientsService,
    TelegramInvitesService,
    NotificationRulesService,
    TelegramRouterService,
  ],
  exports: [
    TelegramRecipientsService,
    TelegramInvitesService,
    NotificationRulesService,
  ],
})
export class TelegramModule {}
