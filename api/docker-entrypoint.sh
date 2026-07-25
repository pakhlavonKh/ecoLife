#!/bin/sh
set -e

ROLE="${1:-api}"

if [ "$ROLE" = "api" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy
  echo "Starting EcoLife API..."
  exec node dist/main.js
fi

if [ "$ROLE" = "bot" ]; then
  echo "Starting EcoLife Telegram bot worker..."
  export TELEGRAM_BOT_ROLE="${TELEGRAM_BOT_ROLE:-worker}"
  exec node dist/bot.main.js
fi

echo "Unknown role: $ROLE (expected: api | bot)" >&2
exit 1

