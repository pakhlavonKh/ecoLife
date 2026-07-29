-- TRANSFER.md Phase 1b: default notification matrix for booking.transferred.
-- Separate migration so the new enum value is already committed (PG 55P04).

INSERT INTO "notification_rules" ("id", "event", "role", "enabled")
VALUES
  (gen_random_uuid(), 'booking.transferred', 'owner', true),
  (gen_random_uuid(), 'booking.transferred', 'admin', true),
  (gen_random_uuid(), 'booking.transferred', 'manager', true),
  (gen_random_uuid(), 'booking.transferred', 'cleaner', true)
ON CONFLICT ("event", "role") DO NOTHING;
