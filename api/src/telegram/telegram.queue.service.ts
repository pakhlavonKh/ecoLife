import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export type TelegramSendFn = (
  chatId: string,
  text: string,
) => Promise<void>;

type QueueJob = {
  chatId: string;
  text: string;
  attempts: number;
};

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-process outbound queue: Telegram failures never block the API request path.
 * Retries with exponential backoff; exhausted jobs are logged and dropped.
 */
@Injectable()
export class TelegramQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramQueueService.name);
  private readonly queue: QueueJob[] = [];
  private draining = false;
  private stopped = false;
  private sendFn: TelegramSendFn | null = null;
  private adminChatIds: string[] = [];

  configure(opts: {
    sendFn: TelegramSendFn | null;
    adminChatIds: string[];
  }): void {
    this.sendFn = opts.sendFn;
    this.adminChatIds = opts.adminChatIds;
  }

  get isReady(): boolean {
    return this.sendFn !== null && this.adminChatIds.length > 0;
  }

  /** Enqueue the same HTML message to all admin chats (fire-and-forget). */
  enqueueBroadcast(text: string): void {
    if (!this.sendFn || this.adminChatIds.length === 0 || this.stopped) {
      return;
    }
    for (const chatId of this.adminChatIds) {
      this.queue.push({ chatId, text, attempts: 0 });
    }
    void this.drain();
  }

  /** Enqueue a single chat message (e.g. /today reply). */
  enqueueTo(chatId: string, text: string): void {
    if (!this.sendFn || this.stopped) {
      return;
    }
    this.queue.push({ chatId, text, attempts: 0 });
    void this.drain();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
  }

  private async drain(): Promise<void> {
    if (this.draining || this.stopped) {
      return;
    }
    this.draining = true;
    try {
      while (this.queue.length > 0 && !this.stopped) {
        const job = this.queue.shift();
        if (!job || !this.sendFn) {
          continue;
        }
        try {
          await this.sendFn(job.chatId, job.text);
        } catch (error) {
          job.attempts += 1;
          const msg =
            error instanceof Error ? error.message : String(error);
          if (job.attempts < MAX_ATTEMPTS) {
            const delay = BASE_DELAY_MS * 2 ** (job.attempts - 1);
            this.logger.warn(
              {
                chatId: job.chatId,
                attempts: job.attempts,
                delay,
                err: msg,
              },
              'Telegram send failed, will retry',
            );
            await sleep(delay);
            this.queue.push(job);
          } else {
            this.logger.error(
              {
                chatId: job.chatId,
                attempts: job.attempts,
                err: msg,
              },
              'Telegram send failed permanently',
            );
          }
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0 && !this.stopped) {
        void this.drain();
      }
    }
  }
}
