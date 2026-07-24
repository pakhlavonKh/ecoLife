import { Decimal } from '@prisma/client/runtime/library';

export function decimalToString(value: Decimal | string | number): string {
  if (value instanceof Decimal) {
    return value.toFixed(2);
  }
  return new Decimal(value).toFixed(2);
}
