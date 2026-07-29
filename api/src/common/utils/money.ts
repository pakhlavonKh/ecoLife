import { Decimal } from '@prisma/client/runtime/library';
import type {
  CategoryPersonPrices,
  GuestCounts,
} from './guest-counts';

export function decimalToString(value: Decimal | string | number): string {
  if (value instanceof Decimal) {
    return value.toFixed(2);
  }
  return new Decimal(value).toFixed(2);
}

export function toDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/**
 * Per-night subtotal before × nights:
 * adults×priceAdult + children×priceChild + infants×priceInfant
 */
export function calcNightlySubtotal(
  counts: GuestCounts,
  prices: CategoryPersonPrices,
): Decimal {
  return toDecimal(prices.priceAdult)
    .mul(counts.adults)
    .add(toDecimal(prices.priceChild).mul(counts.children))
    .add(toDecimal(prices.priceInfant).mul(counts.infants))
    .toDecimalPlaces(2);
}

/**
 * total = (adults×priceAdult + children×priceChild + infants×priceInfant) × nights
 */
export function calcTotalAmount(
  nights: number,
  counts: GuestCounts,
  prices: CategoryPersonPrices,
): Decimal {
  return calcNightlySubtotal(counts, prices)
    .mul(nights)
    .toDecimalPlaces(2);
}

/** deposit = round(total × depositPercent / 100) to 2 dp. */
export function calcDepositAmount(
  total: Decimal | string | number,
  depositPercent: number,
): Decimal {
  return toDecimal(total)
    .mul(depositPercent)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * After bargaining total_amount: remaining = total − paid (floored at 0).
 * Deposit is never recalculated here.
 */
export function calcRemainingAfterTotalChange(
  totalAmount: Decimal | string | number,
  paidAmount: Decimal | string | number,
): Decimal {
  const remaining = toDecimal(totalAmount).sub(toDecimal(paidAmount));
  return remaining.lt(0) ? new Decimal(0) : remaining.toDecimalPlaces(2);
}

/** Human-readable price breakdown parts (for UI / audit). */
export function formatPriceBreakdownParts(
  counts: GuestCounts,
  prices: CategoryPersonPrices,
  nights: number,
): {
  nightlySubtotal: string;
  total: string;
  adults: number;
  children: number;
  infants: number;
  priceAdult: string;
  priceChild: string;
  priceInfant: string;
  nights: number;
} {
  const nightly = calcNightlySubtotal(counts, prices);
  const total = nightly.mul(nights).toDecimalPlaces(2);
  return {
    nightlySubtotal: decimalToString(nightly),
    total: decimalToString(total),
    adults: counts.adults,
    children: counts.children,
    infants: counts.infants,
    priceAdult: decimalToString(prices.priceAdult),
    priceChild: decimalToString(prices.priceChild),
    priceInfant: decimalToString(prices.priceInfant),
    nights,
  };
}
