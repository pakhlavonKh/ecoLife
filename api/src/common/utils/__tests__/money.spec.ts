import { Decimal } from '@prisma/client/runtime/library';
import {
  calcDepositAmount,
  calcRemainingAfterTotalChange,
  calcTotalAmount,
} from '../money';

describe('money utils — age-based pricing + bargain', () => {
  const standart = {
    priceAdult: '600000',
    priceChild: '300000',
    priceInfant: '0',
  };

  it('TZ: 2 adults + 1 child + 1 infant, standart, 2 nights', () => {
    // nightly = 2×600000 + 1×300000 + 1×0 = 1_500_000
    // total = 1_500_000 × 2 = 3_000_000; deposit 30% = 900_000
    const total = calcTotalAmount(
      2,
      { adults: 2, children: 1, infants: 1 },
      standart,
    );
    expect(total.toFixed(2)).toBe('3000000.00');
    expect(calcDepositAmount(total, 30).toFixed(2)).toBe('900000.00');
  });

  it('infants at 0 price do not change total', () => {
    const without = calcTotalAmount(
      1,
      { adults: 1, children: 0, infants: 0 },
      standart,
    );
    const withInfant = calcTotalAmount(
      1,
      { adults: 1, children: 0, infants: 2 },
      standart,
    );
    expect(withInfant.toFixed(2)).toBe(without.toFixed(2));
  });

  it('bargain: deposit stays; remaining = bargained − paid', () => {
    const priceOriginal = calcTotalAmount(
      1,
      { adults: 1, children: 0, infants: 0 },
      standart,
    );
    expect(priceOriginal.toFixed(2)).toBe('600000.00');

    const deposit = calcDepositAmount(priceOriginal, 30);
    expect(deposit.toFixed(2)).toBe('180000.00');

    const paid = deposit;
    const bargainedTotal = new Decimal('500000.00');
    const remaining = calcRemainingAfterTotalChange(bargainedTotal, paid);

    expect(remaining.toFixed(2)).toBe('320000.00');
    expect(deposit.toFixed(2)).toBe('180000.00');
  });

  it('floors remaining at 0 when paid exceeds bargained total', () => {
    const remaining = calcRemainingAfterTotalChange('200000', '300000');
    expect(remaining.toFixed(2)).toBe('0.00');
  });
});
