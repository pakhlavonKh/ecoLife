-- Default language for new recipients: uz
ALTER TABLE "telegram_recipients"
  ALTER COLUMN "language" SET DEFAULT 'uz';

-- Existing recipients → uz
UPDATE "telegram_recipients" SET "language" = 'uz';
