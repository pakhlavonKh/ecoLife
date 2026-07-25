#!/bin/sh
# Daily pg_dump; retain BACKUP_KEEP_DAYS (default 7).
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
HOST="${POSTGRES_HOST:-postgres}"
PORT="${POSTGRES_PORT:-5432}"
USER="${POSTGRES_USER:-ecolife}"
DB="${POSTGRES_DB:-ecolife}"
DIR="${BACKUP_DIR:-/backups}"

mkdir -p "$DIR"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

echo "[backup] started — host=$HOST db=$DB keep=${KEEP_DAYS}d interval=${INTERVAL}s"

# Small delay so postgres can finish starting on first boot
sleep 15

while true; do
  STAMP="$(date +%Y%m%d_%H%M%S)"
  FILE="${DIR}/ecolife_${STAMP}.dump"
  echo "[backup] dumping to $FILE"
  if pg_dump -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -F c -f "$FILE"; then
    echo "[backup] ok $(du -h "$FILE" | awk '{print $1}')"
  else
    echo "[backup] FAILED" >&2
    rm -f "$FILE"
  fi

  # Delete dumps older than KEEP_DAYS
  find "$DIR" -type f -name 'ecolife_*.dump' -mtime "+$((KEEP_DAYS - 1))" -print -delete 2>/dev/null \
    || find "$DIR" -type f -name 'ecolife_*.dump' -mtime +"${KEEP_DAYS}" -print -delete 2>/dev/null \
    || true

  echo "[backup] next run in ${INTERVAL}s"
  sleep "$INTERVAL"
done

