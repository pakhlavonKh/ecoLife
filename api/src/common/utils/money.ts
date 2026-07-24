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

/** total = nights × pricePerNight (2 dp). */
export function calcTotalAmount(
  nights: number,
  pricePerNight: Decimal | string | number,
): Decimal {
  return toDecimal(pricePerNight).mul(nights).toDecimalPlaces(2);
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
