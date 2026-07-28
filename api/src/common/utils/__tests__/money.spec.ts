import { Decimal } from '@prisma/client/runtime/library';
import {
  calcDepositAmount,
  calcRemainingAfterTotalChange,
  calcTotalAmount,
} from '../money';

describe('money utils — bargain remaining', () => {
  it('TZ example: standart 1 night 1_000_000, deposit 300_000, total → 850_000', () => {
    const priceOriginal = calcTotalAmount(1, '1000000');
    expect(priceOriginal.toFixed(2)).toBe('1000000.00');

    const deposit = calcDepositAmount(priceOriginal, 30);
    expect(deposit.toFixed(2)).toBe('300000.00');

    const paid = deposit; // deposit already paid online
    const bargainedTotal = new Decimal('850000.00');
    const remaining = calcRemainingAfterTotalChange(bargainedTotal, paid);

    expect(remaining.toFixed(2)).toBe('550000.00');
    // Deposit is not recalculated from bargained total
    expect(calcDepositAmount(bargainedTotal, 30).toFixed(2)).not.toBe(
      deposit.toFixed(2),
    );
    expect(deposit.toFixed(2)).toBe('300000.00');
  });

  it('floors remaining at 0 when paid exceeds bargained total', () => {
    const remaining = calcRemainingAfterTotalChange('200000', '300000');
    expect(remaining.toFixed(2)).toBe('0.00');
  });
});
