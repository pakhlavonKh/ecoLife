import type { Decimal } from '@prisma/client/runtime/library';

/** Age-band boundaries (exclusive upper bounds for child/infant labels). */
export type AgeBandConfig = {
  /** Children are under this age (default 12). */
  childMaxAge: number;
  /** Infants are under this age (default 3). */
  infantMaxAge: number;
};

export type GuestCounts = {
  adults: number;
  children: number;
  infants: number;
};

export type CategoryPersonPrices = {
  priceAdult: string | number | Decimal;
  priceChild: string | number | Decimal;
  priceInfant: string | number | Decimal;
};

export function readAgeBandConfig(env: {
  get: (key: string) => string | undefined;
}): AgeBandConfig {
  return {
    childMaxAge: Number(env.get('CHILD_MAX_AGE') ?? 12),
    infantMaxAge: Number(env.get('INFANT_MAX_AGE') ?? 3),
  };
}

/** Beds that occupy inventory (infants excluded). */
export function occupyingBeds(counts: GuestCounts): number {
  return counts.adults + counts.children;
}

/** Total headcount including infants (display / meal forecasts). */
export function totalGuests(counts: GuestCounts): number {
  return counts.adults + counts.children + counts.infants;
}

export function assertValidGuestCounts(counts: GuestCounts): void {
  if (
    !Number.isInteger(counts.adults) ||
    !Number.isInteger(counts.children) ||
    !Number.isInteger(counts.infants)
  ) {
    throw new Error('Guest counts must be integers');
  }
  if (counts.adults < 1) {
    throw new Error('At least one adult is required');
  }
  if (counts.children < 0 || counts.infants < 0) {
    throw new Error('Children and infants cannot be negative');
  }
  if (counts.adults > 50 || counts.children > 50 || counts.infants > 50) {
    throw new Error('Guest count out of range');
  }
  if (occupyingBeds(counts) < 1) {
    throw new Error('At least one occupying guest (adult or child) is required');
  }
}
