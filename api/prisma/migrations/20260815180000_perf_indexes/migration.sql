-- Performance: booking_rooms date-range indexes for availability + calendar queries.
-- The existing (room_id, is_active) index cannot efficiently filter by date range.

-- Cover the raw SQL query in loadActiveStaysByRoom:
--   WHERE is_active = true AND room_id IN (...) AND check_in < $to AND check_out > $from
CREATE INDEX "booking_rooms_active_dates_idx"
  ON "booking_rooms" ("is_active", "check_in", "check_out");

-- Cover calendar query: WHERE check_in < $to AND check_out > $from (status != cancelled)
CREATE INDEX "booking_rooms_dates_idx"
  ON "booking_rooms" ("check_in", "check_out");

-- Cover listAdmin ORDER BY created_at DESC
CREATE INDEX "bookings_created_at_idx"
  ON "bookings" ("created_at" DESC);

-- Cover bookings JOIN customers (customer_id FK lookup)
CREATE INDEX "bookings_customer_id_idx"
  ON "bookings" ("customer_id");

-- Cover bookings.payment_status filter in listAdmin
CREATE INDEX "bookings_payment_status_idx"
  ON "bookings" ("payment_status");
