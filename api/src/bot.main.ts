/**
 * Telegram bot worker entrypoint (prod).
 * Long-polling for /today; outbound notifications stay on the API process.
 *
 * Set TELEGRAM_BOT_ROLE=worker (defaulted below when unset).
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BotModule } from './bot.module';

async function bootstrap() {
  if (!process.env.TELEGRAM_BOT_ROLE) {
    process.env.TELEGRAM_BOT_ROLE = 'worker';
  }

  const app = await NestFactory.createApplicationContext(BotModule, {
    logger: ['error', 'warn', 'log'],
  });

  const logger = new Logger('BotWorker');
  logger.log(
    `EcoLife Telegram bot worker started (role=${process.env.TELEGRAM_BOT_ROLE})`,
  );

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down bot worker`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
