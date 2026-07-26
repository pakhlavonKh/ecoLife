-- CreateEnum
CREATE TYPE "telegram_language" AS ENUM ('ru', 'uz');

-- AlterTable
ALTER TABLE "telegram_recipients"
  ADD COLUMN "language" "telegram_language" NOT NULL DEFAULT 'ru';
