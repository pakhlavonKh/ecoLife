import {
  buildDayMealCounts,
  enumerateDatesInclusive,
  isPresentAtMeal,
  mealInstantForDate,
  parseMealTimes,
} from '../meal-forecast.engine';
import { parseLocalDateTime } from '../../common/utils/datetime';

describe('meal forecast presence (half-open stay)', () => {
  const checkIn = parseLocalDateTime('2026-08-05', '16:00');
  const checkOut = parseLocalDateTime('2026-08-07', '12:00');

  it('skips breakfast and lunch on arrival day (check-in 16:00)', () => {
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-05', '08:00')),
    ).toBe(false);
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-05', '13:00')),
    ).toBe(false);
  });

  it('counts dinner on arrival day (19:00 after 16:00 check-in)', () => {
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-05', '19:00')),
    ).toBe(true);
  });

  it('counts all meals on a full middle day', () => {
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-06', '08:00')),
    ).toBe(true);
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-06', '13:00')),
    ).toBe(true);
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-06', '19:00')),
    ).toBe(true);
  });

  it('counts breakfast on departure day before 12:00 checkout, not lunch/dinner', () => {
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-07', '08:00')),
    ).toBe(true);
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-07', '13:00')),
    ).toBe(false);
    expect(
      isPresentAtMeal(checkIn, checkOut, mealInstantForDate('2026-08-07', '19:00')),
    ).toBe(false);
  });

  it('excludes meal exactly at check-out (half-open)', () => {
    const outAtLunch = parseLocalDateTime('2026-08-07', '13:00');
    expect(
      isPresentAtMeal(
        checkIn,
        outAtLunch,
        mealInstantForDate('2026-08-07', '13:00'),
      ),
    ).toBe(false);
  });
});

describe('buildDayMealCounts', () => {
  const mealTimes = parseMealTimes({});

  it('aggregates beds_total across bookings per meal', () => {
    const stays = [
      {
        checkIn: parseLocalDateTime('2026-08-05', '16:00'),
        checkOut: parseLocalDateTime('2026-08-07', '12:00'),
        guests: 7,
      },
      {
        checkIn: parseLocalDateTime('2026-08-05', '14:00'),
        checkOut: parseLocalDateTime('2026-08-06', '12:00'),
        guests: 2,
      },
    ];
    const days = buildDayMealCounts(
      stays,
      enumerateDatesInclusive('2026-08-05', '2026-08-07'),
      mealTimes,
    );

    expect(days).toEqual([
      { date: '2026-08-05', breakfast: 0, lunch: 0, dinner: 9, total: 9 },
      { date: '2026-08-06', breakfast: 9, lunch: 7, dinner: 7, total: 23 },
      { date: '2026-08-07', breakfast: 7, lunch: 0, dinner: 0, total: 7 },
    ]);
  });

  it('rejects ranges longer than 90 days', () => {
    expect(() => enumerateDatesInclusive('2026-01-01', '2026-04-15')).toThrow(
      /90/,
    );
  });
});
