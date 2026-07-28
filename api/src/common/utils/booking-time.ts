/**
 * Stay-time configuration (HOURLY.md §3): default wall-clock check-in/out times and
 * the cleaning buffer. Kept as env config, never persisted — changing the buffer
 * must re-price future availability without a data migration.
 */
import {
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  parseTimeOfDay,
} from './datetime';

export const DEFAULT_CLEANING_BUFFER_MINUTES = 60;

type ConfigLike = { get: (key: string) => unknown };

function readString(config: ConfigLike, key: string): string | undefined {
  const raw = config.get(key);
  if (raw == null) {
    return undefined;
  }
  const value = String(raw).trim();
  return value === '' ? undefined : value;
}

function readTime(config: ConfigLike, key: string, fallback: string): string {
  const value = readString(config, key);
  if (value === undefined) {
    return fallback;
  }
  // Reject a malformed env value loudly at read time rather than silently drifting.
  parseTimeOfDay(value, key);
  return value;
}

/** CHECK_IN_TIME, local HH:mm (default 14:00). */
export function getDefaultCheckInTime(config: ConfigLike): string {
  return readTime(config, 'CHECK_IN_TIME', DEFAULT_CHECK_IN_TIME);
}

/** CHECK_OUT_TIME, local HH:mm (default 12:00). */
export function getDefaultCheckOutTime(config: ConfigLike): string {
  return readTime(config, 'CHECK_OUT_TIME', DEFAULT_CHECK_OUT_TIME);
}

/**
 * CLEANING_BUFFER_MINUTES (default 60): after every check-out the beds that were
 * released stay unavailable this long. Global for now; may become per-category.
 */
export function getCleaningBufferMinutes(config: ConfigLike): number {
  const value = readString(config, 'CLEANING_BUFFER_MINUTES');
  if (value === undefined) {
    return DEFAULT_CLEANING_BUFFER_MINUTES;
  }
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 0) {
    throw new Error(
      `CLEANING_BUFFER_MINUTES must be a non-negative integer (got "${value}")`,
    );
  }
  return minutes;
}
