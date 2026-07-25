-- Phase A (BOT_ROLES.md): telegram recipients, invites, notification rules

CREATE TYPE "telegram_staff_role" AS ENUM ('owner', 'admin', 'manager', 'cleaner');

CREATE TYPE "notification_event" AS ENUM (
  'booking.created',
  'payment.received',
  'booking.checked_in',
  'booking.checked_out',
  'booking.updated',
  'booking.cancelled',
  'system.hold_expired',
  'system.late_payment_review',
  'system.payment_failed',
  'digest.morning'
);

CREATE TABLE "telegram_recipients" (
  "id" UUID NOT NULL,
  "chat_id" BIGINT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "telegram_staff_role" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "muted_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "telegram_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_recipients_chat_id_key" ON "telegram_recipients"("chat_id");

CREATE TABLE "telegram_invites" (
  "id" UUID NOT NULL,
  "code" VARCHAR(8) NOT NULL,
  "role" "telegram_staff_role" NOT NULL,
  "created_by" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "used_by_chat_id" BIGINT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "telegram_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_invites_code_key" ON "telegram_invites"("code");
CREATE INDEX "telegram_invites_expires_at_idx" ON "telegram_invites"("expires_at");

ALTER TABLE "telegram_invites"
  ADD CONSTRAINT "telegram_invites_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "notification_rules" (
  "id" UUID NOT NULL,
  "event" "notification_event" NOT NULL,
  "role" "telegram_staff_role" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_rules_event_role_key"
  ON "notification_rules"("event", "role");
