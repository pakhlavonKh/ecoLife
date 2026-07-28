import { Decimal } from '@prisma/client/runtime/library';

export function decimalToString(value: Decimal | string | number): string {
  if (value instanceof Decimal) {
    return value.toFixed(2);
  }
  return new Decimal(value).toFixed(2);
}

export function toDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** total = pricePerBedPerNight × guests × nights (2 dp). */
export function calcTotalAmount(
  nights: number,
  pricePerBedPerNight: Decimal | string | number,
  guests = 1,
): Decimal {
  return toDecimal(pricePerBedPerNight)
    .mul(guests)
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
