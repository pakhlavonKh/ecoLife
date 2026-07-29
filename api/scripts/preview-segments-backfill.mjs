/**
 * READ-ONLY preview / verify of TRANSFER.md Phase 1 segment backfill
 * (migration 20260729160000_booking_transfer_segments).
 *
 * Before migrate: shows planned single-segment shape (segment_index=0,
 * amount=total, price_breakdown with one segment).
 * After migrate: verifies every booking_rooms row has segment_index + amount
 * and every booking has price_breakdown.
 *
 * Usage: node scripts/preview-segments-backfill.mjs
 * Env:   DATABASE_URL
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function heading(text) {
  console.log(`\n${text}`);
  console.log('─'.repeat(Math.min(text.length, 72)));
}

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = '${table.replace(/'/g, "''")}'
      AND column_name = '${column.replace(/'/g, "''")}'
    LIMIT 1
  `);
  return rows.length > 0;
}

async function main() {
  console.log('Segment backfill preview (READ-ONLY, no writes)');
  console.log(`DATABASE_URL host: ${(process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':***@')}`);

  const hasSegment = await columnExists('booking_rooms', 'segment_index');
  const hasBreakdown = await columnExists('bookings', 'price_breakdown');

  heading('Schema state');
  console.log(`  booking_rooms.segment_index: ${hasSegment ? 'present' : 'MISSING (pre-migrate)'}`);
  console.log(`  booking_rooms.amount:        ${(await columnExists('booking_rooms', 'amount')) ? 'present' : 'MISSING'}`);
  console.log(`  bookings.price_breakdown:    ${hasBreakdown ? 'present' : 'MISSING (pre-migrate)'}`);

  const totals = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::int FROM bookings) AS bookings,
      (SELECT COUNT(*)::int FROM booking_rooms) AS booking_rooms,
      (SELECT COUNT(*)::int FROM booking_rooms WHERE is_active) AS active_rooms
  `);
  const t = totals[0];
  heading('Counts');
  console.log(`  bookings:       ${t.bookings}`);
  console.log(`  booking_rooms:  ${t.booking_rooms} (active ${t.active_rooms})`);

  if (!hasSegment || !hasBreakdown) {
    heading('Planned backfill (after migrate deploy)');
    console.log('  Each booking_rooms row → segment_index = 0, amount = parent total_amount');
    console.log('  Each booking.price_breakdown → version:1, single segment, total = total_amount');
    console.log('  Existing single-room bookings stay one segment (no behavior change).');

    const sample = await prisma.$queryRawUnsafe(`
      SELECT b.public_code,
             r.number AS room_number,
             br.beds_booked,
             to_char(b.total_amount, 'FM9999999999990.00') AS total,
             to_char(br.check_in  AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS cin,
             to_char(br.check_out AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS cout
      FROM bookings b
      JOIN booking_rooms br ON br.booking_id = b.id
      JOIN rooms r ON r.id = br.room_id
      ORDER BY b.updated_at DESC
      LIMIT 10
    `);
    heading('Sample rows (will become segment 0)');
    for (const row of sample) {
      console.log(
        `  ${row.public_code}  room ${row.room_number}  beds ${row.beds_booked}  ` +
          `${row.cin} → ${row.cout}  total ${row.total}`,
      );
    }
    console.log('\nNext: prisma migrate deploy, then re-run this script to verify.');
    return;
  }

  heading('Post-migrate verification');
  const badSegments = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n
    FROM booking_rooms
    WHERE segment_index IS NULL OR amount IS NULL
  `);
  const missingBreakdown = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n
    FROM bookings
    WHERE price_breakdown IS NULL
  `);
  const multiSeg = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT booking_id
      FROM booking_rooms
      WHERE is_active
      GROUP BY booking_id
      HAVING COUNT(*) > 1
    ) x
  `);
  const singleSeg = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT booking_id
      FROM booking_rooms
      GROUP BY booking_id
      HAVING COUNT(*) = 1 AND MAX(segment_index) = 0
    ) x
  `);

  console.log(`  booking_rooms with NULL segment/amount: ${badSegments[0].n}`);
  console.log(`  bookings missing price_breakdown:       ${missingBreakdown[0].n}`);
  console.log(`  bookings with single segment_index=0:   ${singleSeg[0].n}`);
  console.log(`  bookings with multiple active segments: ${multiSeg[0].n} (ok after transfer/extend)`);

  const sample = await prisma.$queryRawUnsafe(`
    SELECT b.public_code,
           br.segment_index,
           r.number AS room_number,
           br.beds_booked,
           to_char(COALESCE(br.amount, b.total_amount), 'FM9999999999990.00') AS seg_amount,
           to_char(b.total_amount, 'FM9999999999990.00') AS total,
           jsonb_array_length(COALESCE(b.price_breakdown->'segments', '[]'::jsonb)) AS seg_count
    FROM bookings b
    JOIN booking_rooms br ON br.booking_id = b.id
    JOIN rooms r ON r.id = br.room_id
    ORDER BY b.updated_at DESC, br.segment_index
    LIMIT 15
  `);
  heading('Sample segments');
  for (const row of sample) {
    console.log(
      `  ${row.public_code}  seg#${row.segment_index}  room ${row.room_number}  ` +
        `beds ${row.beds_booked}  amount ${row.seg_amount}  ` +
        `total ${row.total}  breakdown.segs=${row.seg_count}`,
    );
  }

  if (badSegments[0].n > 0 || missingBreakdown[0].n > 0) {
    console.error('\nFAIL: incomplete backfill — investigate before go-live.');
    process.exitCode = 1;
  } else {
    console.log('\nOK: segment backfill looks complete.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
