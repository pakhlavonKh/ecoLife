import { BadRequestException } from '@nestjs/common';
import { parseLocalDateTime } from '../../common/utils/datetime';
import {
  calcExtendMoney,
  calcTransferMoney,
  splitStayAtTransfer,
} from '../transfer-math';

const t = (date: string, time: string) => parseLocalDateTime(date, time);

const standart = {
  priceAdult: '600000',
  priceChild: '300000',
  priceInfant: '0',
};
const lux = {
  priceAdult: '800000',
  priceChild: '400000',
  priceInfant: '0',
};

describe('transfer-math — split dates (TRANSFER Phase 2)', () => {
  it('splits [checkIn, checkOut) at transfer_ts into A and B', () => {
    const checkIn = t('2026-08-01', '14:00');
    const checkOut = t('2026-08-05', '12:00');
    const transferAt = t('2026-08-03', '14:00');

    const split = splitStayAtTransfer(checkIn, checkOut, transferAt);

    expect(split.segmentA.checkIn).toEqual(checkIn);
    expect(split.segmentA.checkOut).toEqual(transferAt);
    expect(split.segmentB.checkIn).toEqual(transferAt);
    expect(split.segmentB.checkOut).toEqual(checkOut);
    // Aug1→Aug3 = 2 nights; Aug3→Aug5 = 2 nights
    expect(split.segmentA.nights).toBe(2);
    expect(split.segmentB.nights).toBe(2);
  });

  it('rejects transfer_ts at/before check-in or at/after check-out', () => {
    const checkIn = t('2026-08-01', '14:00');
    const checkOut = t('2026-08-05', '12:00');
    expect(() =>
      splitStayAtTransfer(checkIn, checkOut, checkIn),
    ).toThrow(BadRequestException);
    expect(() =>
      splitStayAtTransfer(checkIn, checkOut, checkOut),
    ).toThrow(BadRequestException);
    expect(() =>
      splitStayAtTransfer(checkIn, checkOut, t('2026-07-31', '14:00')),
    ).toThrow(BadRequestException);
  });
});

describe('transfer-math — surcharge with age pricing', () => {
  const counts = { adults: 2, children: 1, infants: 1 };

  it('upgrade: lived @ old price, remaining @ new; surcharge = newRem − oldRem', () => {
    // nightly standart = 2×600k + 1×300k + 0 = 1_500_000
    // nightly lux      = 2×800k + 1×400k + 0 = 2_000_000
    // 2 lived + 2 remaining
    const money = calcTransferMoney({
      livedNights: 2,
      remainingNights: 2,
      counts,
      oldPrices: standart,
      newPrices: lux,
      sameCategory: false,
    });

    expect(money.operation).toBe('upgrade');
    expect(money.livedAmount.toFixed(2)).toBe('3000000.00'); // 1.5M × 2
    expect(money.oldRemainingAmount.toFixed(2)).toBe('3000000.00');
    expect(money.newRemainingAmount.toFixed(2)).toBe('4000000.00'); // 2M × 2
    expect(money.suggestedSurcharge.toFixed(2)).toBe('1000000.00');
    expect(money.appliedSurcharge.toFixed(2)).toBe('1000000.00');
    expect(money.segmentAAmount.toFixed(2)).toBe('3000000.00');
    expect(money.segmentBAmount.toFixed(2)).toBe('4000000.00');
    expect(money.totalAmount.toFixed(2)).toBe('7000000.00');
  });

  it('upgrade: editable surcharge overrides catalog difference', () => {
    const money = calcTransferMoney({
      livedNights: 2,
      remainingNights: 2,
      counts,
      oldPrices: standart,
      newPrices: lux,
      sameCategory: false,
      surchargeOverride: '500000',
    });
    expect(money.suggestedSurcharge.toFixed(2)).toBe('1000000.00');
    expect(money.appliedSurcharge.toFixed(2)).toBe('500000.00');
    expect(money.segmentBAmount.toFixed(2)).toBe('3500000.00'); // 3M + 0.5M
    expect(money.totalAmount.toFixed(2)).toBe('6500000.00');
  });

  it('same-class transfer: surcharge = 0; paid path leaves total at catalog sum', () => {
    const money = calcTransferMoney({
      livedNights: 2,
      remainingNights: 2,
      counts,
      oldPrices: standart,
      newPrices: standart,
      sameCategory: true,
      surchargeOverride: '999999', // ignored
    });
    expect(money.operation).toBe('transfer');
    expect(money.appliedSurcharge.toFixed(2)).toBe('0.00');
    expect(money.totalAmount.toFixed(2)).toBe('6000000.00');
  });

  it('infants at 0 price do not inflate upgrade surcharge', () => {
    const without = calcTransferMoney({
      livedNights: 1,
      remainingNights: 1,
      counts: { adults: 1, children: 0, infants: 0 },
      oldPrices: standart,
      newPrices: lux,
      sameCategory: false,
    });
    const withInfants = calcTransferMoney({
      livedNights: 1,
      remainingNights: 1,
      counts: { adults: 1, children: 0, infants: 3 },
      oldPrices: standart,
      newPrices: lux,
      sameCategory: false,
    });
    expect(withInfants.suggestedSurcharge.toFixed(2)).toBe(
      without.suggestedSurcharge.toFixed(2),
    );
  });
});

describe('transfer-math — extend amount', () => {
  it('adds catalog nights × age pricing; override editable', () => {
    const money = calcExtendMoney({
      previousCheckIn: t('2026-08-01', '14:00'),
      previousCheckOut: t('2026-08-03', '12:00'),
      newCheckOut: t('2026-08-05', '12:00'),
      counts: { adults: 2, children: 1, infants: 0 },
      prices: standart,
      previousTotal: '3000000',
    });
    // previous 2 nights, new 4 → added 2; nightly 1.5M → 3M
    expect(money.addedNights).toBe(2);
    expect(money.catalogAddedAmount.toFixed(2)).toBe('3000000.00');
    expect(money.newTotal.toFixed(2)).toBe('6000000.00');

    const bargained = calcExtendMoney({
      previousCheckIn: t('2026-08-01', '14:00'),
      previousCheckOut: t('2026-08-03', '12:00'),
      newCheckOut: t('2026-08-05', '12:00'),
      counts: { adults: 2, children: 1, infants: 0 },
      prices: standart,
      previousTotal: '3000000',
      addedAmountOverride: '2000000',
    });
    expect(bargained.appliedAddedAmount.toFixed(2)).toBe('2000000.00');
    expect(bargained.newTotal.toFixed(2)).toBe('5000000.00');
  });
});
