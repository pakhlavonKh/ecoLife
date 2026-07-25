import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;

/** Strict: auth login / public booking create. */
export function StrictThrottle(limit: number, ttlMs = MINUTE) {
  return Throttle({ default: { limit, ttl: ttlMs } });
}

/** Soft: authenticated admin CRM traffic. */
export function AdminThrottle() {
  return Throttle({ default: { limit: 300, ttl: MINUTE } });
}
