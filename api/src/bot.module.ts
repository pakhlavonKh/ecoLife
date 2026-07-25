import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DashboardCoreModule } from './dashboard/dashboard-core.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';

/**
 * Minimal Nest context for the Telegram long-polling worker.
 * No HTTP server — outbound domain events are handled by the API process.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    DashboardCoreModule,
    TelegramModule,
  ],
})
export class BotModule {}
