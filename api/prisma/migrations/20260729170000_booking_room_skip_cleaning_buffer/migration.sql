-- TRANSFER.md Phase 2: transfer-out frees beds immediately (no 1h cleaning buffer),
-- while still notifying cleaners via booking.transferred. Per-segment flag so
-- normal check-outs keep the buffer (HOURLY.md variant б).

ALTER TABLE "booking_rooms"
  ADD COLUMN "skip_cleaning_buffer" BOOLEAN NOT NULL DEFAULT false;
