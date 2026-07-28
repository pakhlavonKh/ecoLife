/**
 * READ-ONLY preview of the DATE -> TIMESTAMPTZ migration (HOURLY.md Phase 1).
 *
 * Prints, without writing anything:
 *   - current column types of bookings / booking_rooms / room_locks
 *   - the exact timestamps every existing row would get after backfill
 *   - anomalies that would break the migration (NULLs, check_in >= check_out)
 *
 * Usage: node scripts/preview-datetime-backfill.mjs
 * Env:   DATABASE_URL, CHECK_IN_TIME (default 14:00), CHECK_OUT_TIME (default 12:00),
 *        APP_TIME_ZONE (default Asia/Tashkent)
 */
import { PrismaClient } from '@prisma/client';

const TZ = process.env.APP_TIME_ZONE ?? 'Asia/Tashkent';
const CHECK_IN_TIME = process.env.CHECK_IN_TIME ?? '14:00';
const CHECK_OUT_TIME = process.env.CHECK_OUT_TIME ?? '12:00';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
for (const [name, value] of [
  ['CHECK_IN_TIME', CHECK_IN_TIME],
  ['CHECK_OUT_TIME', CHECK_OUT_TIME],
]) {
  if (!TIME_RE.test(value)) {
    console.error(`${name} must be HH:mm (got "${value}")`);
    process.exit(1);
  }
}

const prisma = new PrismaClient();

/** Tables whose check_in/check_out move to TIMESTAMPTZ, with their sort key. */
const TABLES = [
  { name: 'bookings', label: 'public_code', order: 'check_in' },
  { name: 'booking_rooms', label: 'booking_id::text', order: 'check_in' },
  { name: 'room_locks', label: 'coalesce(reason, \'—\')', order: 'check_in' },
];

function heading(text) {
  console.log(`\n${text}`);
  console.log('─'.repeat(text.length));
}

async function showColumnTypes() {
  heading('Current column types');
  const rows = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type,
           CASE WHEN is_generated = 'ALWAYS' THEN 'generated' ELSE '' END AS kind
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('bookings', 'booking_rooms', 'room_locks')
      AND column_name IN ('check_in', 'check_out', 'stay')
    ORDER BY table_name, column_name
  `);
  for (const r of rows) {
    console.log(
      `  ${r.table_name.padEnd(14)} ${r.column_name.padEnd(10)} ${r.data_type}${
        r.kind ? ` (${r.kind})` : ''
      }`,
    );
  }
}

async function showConstraints() {
  heading('Constraints that must be rebuilt');
  const rows = await prisma.$queryRawUnsafe(`
    SELECT c.conname, t.relname AS table_name, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname IN ('bookings', 'booking_rooms', 'room_locks')
      AND c.contype IN ('x', 'c')
    ORDER BY t.relname, c.conname
  `);
  if (rows.length === 0) {
    console.log('  (none)');
  }
  for (const r of rows) {
    console.log(`  ${r.table_name}.${r.conname}: ${r.def}`);
  }
}

async function previewTable({ name, label, order }) {
  const [{ count }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM "${name}"`,
  );
  heading(`${name} — ${count} row(s) would be converted`);
  if (count === 0) {
    console.log('  (empty — nothing to backfill)');
    return { name, count, anomalies: 0 };
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      ${label} AS label,
      check_in::text  AS old_check_in,
      check_out::text AS old_check_out,
      to_char(
        ((check_in::timestamp + TIME '${CHECK_IN_TIME}') AT TIME ZONE '${TZ}')
          AT TIME ZONE '${TZ}',
        'YYYY-MM-DD HH24:MI'
      ) AS new_check_in_local,
      to_char(
        ((check_out::timestamp + TIME '${CHECK_OUT_TIME}') AT TIME ZONE '${TZ}')
          AT TIME ZONE '${TZ}',
        'YYYY-MM-DD HH24:MI'
      ) AS new_check_out_local,
      to_char(
        (check_in::timestamp + TIME '${CHECK_IN_TIME}') AT TIME ZONE '${TZ}',
        'YYYY-MM-DD HH24:MI'
      ) AS new_check_in_utc,
      to_char(
        (check_out::timestamp + TIME '${CHECK_OUT_TIME}') AT TIME ZONE '${TZ}',
        'YYYY-MM-DD HH24:MI'
      ) AS new_check_out_utc,
      (check_out::date - check_in::date) AS nights
    FROM "${name}"
    ORDER BY ${order}
    LIMIT 50
  `);

  for (const r of rows) {
    console.log(
      `  ${String(r.label).padEnd(24)} ` +
        `${r.old_check_in} → ${r.old_check_out}  ` +
        `becomes  ${r.new_check_in_local} → ${r.new_check_out_local} (${TZ}) ` +
        `= ${r.new_check_in_utc}Z → ${r.new_check_out_utc}Z, ${r.nights} night(s)`,
    );
  }
  if (count > rows.length) {
    console.log(`  … ${count - rows.length} more row(s) not shown`);
  }

  const [{ bad_order, nulls }] = await prisma.$queryRawUnsafe(`
    SELECT
      count(*) FILTER (
        WHERE (check_in::timestamp + TIME '${CHECK_IN_TIME}')
              >= (check_out::timestamp + TIME '${CHECK_OUT_TIME}')
      )::int AS bad_order,
      count(*) FILTER (
        WHERE check_in IS NULL OR check_out IS NULL
      )::int AS nulls
    FROM "${name}"
  `);
  const anomalies = bad_order + nulls;
  if (anomalies === 0) {
    console.log('  OK: no NULLs, every converted check_in < check_out');
  } else {
    console.log(
      `  ANOMALIES: ${nulls} NULL date(s), ${bad_order} row(s) where ` +
        `converted check_in >= check_out (same-day stays would violate the CHECK constraint)`,
    );
  }
  return { name, count, anomalies };
}

async function main() {
  console.log('DATE → TIMESTAMPTZ backfill preview (READ-ONLY, no writes)');
  console.log(
    `Defaults: check-in ${CHECK_IN_TIME}, check-out ${CHECK_OUT_TIME}, timezone ${TZ}`,
  );

  await showColumnTypes();
  await showConstraints();

  const results = [];
  for (const table of TABLES) {
    results.push(await previewTable(table));
  }

  heading('Summary');
  let anomalies = 0;
  for (const r of results) {
    anomalies += r.anomalies;
    console.log(
      `  ${r.name.padEnd(14)} ${String(r.count).padStart(6)} row(s), ${r.anomalies} anomaly(ies)`,
    );
  }
  console.log(
    anomalies === 0
      ? '\nSafe to apply: no anomalies found. Nothing was written by this script.'
      : `\nDO NOT APPLY yet: ${anomalies} anomaly(ies) need a decision first.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
