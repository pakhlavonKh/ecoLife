import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DashboardService } from '../dashboard/dashboard.service';
import { TelegramNotifyService } from './telegram.notify.service';
import type { TodayBrief } from './telegram.messages';

/**
 * Morning digest at DIGEST_HOUR Asia/Tashkent (default 08:00).
 * Cleaner scope: checkout rooms only (no names/money).
 */
@Injectable()
export class TelegramDigestWorker {
  private readonly logger = new Logger(TelegramDigestWorker.name);
  private readonly digestHour: number;

  constructor(
    private readonly config: ConfigService,
    private readonly dashboard: DashboardService,
    private readonly notify: TelegramNotifyService,
  ) {
    const raw = Number(this.config.get<string>('DIGEST_HOUR') ?? '8');
    this.digestHour = Number.isFinite(raw)
      ? Math.min(23, Math.max(0, Math.trunc(raw)))
      : 8;
  }

  /** Fires every hour; runs body only at DIGEST_HOUR in Asia/Tashkent. */
  @Cron('5 * * * *', { timeZone: 'Asia/Tashkent' })
  async handleCron(): Promise<void> {
    const now = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }),
    );
    if (now.getHours() !== this.digestHour) {
      return;
    }
    try {
      const stats = await this.dashboard.getStats();
      const arrivals = (stats.arrivalsList ?? []) as TodayBrief[];
      const departures = (stats.departuresList ?? []) as TodayBrief[];
      this.notify.sendMorningDigest(stats.today, arrivals, departures);
      this.logger.log(
        { date: stats.today, arrivals: arrivals.length, departures: departures.length },
        'Morning Telegram digest enqueued',
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: msg }, 'Morning digest failed');
    }
  }
}
