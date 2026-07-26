import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export type TelegramSendFn = (
  chatId: string,
  text: string,
) => Promise<void>;

/** Called when Telegram returns 403 (bot blocked / chat forbidden). */
export type TelegramForbiddenHandler = (chatId: string) => Promise<void>;

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

/** Detect Telegram 403 / bot-blocked errors (GrammyError or plain Error). */
export function isTelegramForbiddenError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'error_code' in error) {
    const code = (error as { error_code?: unknown }).error_code;
    if (code === 403) {
      return true;
    }
  }
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /\b403\b/.test(msg) ||
    /bot was blocked by the user/i.test(msg) ||
    /user is deactivated/i.test(msg) ||
    /chat not found/i.test(msg) ||
    /Forbidden: bot was kicked/i.test(msg)
  );
}

/**
 * In-process outbound queue: Telegram failures never block the API request path.
 * Per-recipient jobs — one failure does not stop delivery to other chats.
 * Retries with exponential backoff (requeued asynchronously); 403 → optional handler.
 */
@Injectable()
export class TelegramQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramQueueService.name);
  private readonly queue: QueueJob[] = [];
  private draining = false;
  private stopped = false;
  private sendFn: TelegramSendFn | null = null;
  private onForbidden: TelegramForbiddenHandler | null = null;
  private pendingRetries = 0;

  configure(opts: {
    sendFn: TelegramSendFn | null;
    onForbidden?: TelegramForbiddenHandler | null;
  }): void {
    this.sendFn = opts.sendFn;
    this.onForbidden = opts.onForbidden ?? null;
  }

  get isReady(): boolean {
    return this.sendFn !== null;
  }

  /**
   * @deprecated Prefer enqueueTo / enqueueMany — kept for tests that broadcast
   * the same text to a fixed chat list.
   */
  enqueueBroadcast(text: string, chatIds: string[]): void {
    for (const chatId of chatIds) {
      this.enqueueTo(chatId, text);
    }
  }

  /** Enqueue distinct HTML messages (one job per recipient). */
  enqueueMany(jobs: Array<{ chatId: string; text: string }>): void {
    if (!this.sendFn || this.stopped || jobs.length === 0) {
      return;
    }
    for (const job of jobs) {
      this.queue.push({ chatId: job.chatId, text: job.text, attempts: 0 });
    }
    void this.drain();
  }

  /** Enqueue a single chat message. */
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
          const msg =
            error instanceof Error ? error.message : String(error);

          if (isTelegramForbiddenError(error)) {
            this.logger.warn(
              { chatId: job.chatId, err: msg },
              'Telegram 403 — recipient will be deactivated',
            );
            if (this.onForbidden) {
              try {
                await this.onForbidden(job.chatId);
              } catch (handlerErr) {
                const hMsg =
                  handlerErr instanceof Error
                    ? handlerErr.message
                    : String(handlerErr);
                this.logger.error(
                  { chatId: job.chatId, err: hMsg },
                  'Failed to auto-deactivate blocked recipient',
                );
              }
            }
            continue;
          }

          job.attempts += 1;
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
            // Non-blocking requeue so other recipients are not stalled.
            this.pendingRetries += 1;
            const timer = setTimeout(() => {
              this.pendingRetries -= 1;
              if (this.stopped) {
                return;
              }
              this.queue.push(job);
              void this.drain();
            }, delay);
            timer.unref?.();
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

  /** Test helper: wait until queue + scheduled retries settle. */
  async settle(timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (
        this.queue.length === 0 &&
        !this.draining &&
        this.pendingRetries === 0
      ) {
        return;
      }
      await sleep(50);
    }
  }
}
