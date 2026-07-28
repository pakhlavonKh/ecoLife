-- Optional Telegram event: whole-room lock created (bed-mode Phase 5)

ALTER TYPE "notification_event" ADD VALUE IF NOT EXISTS 'system.room_locked';
