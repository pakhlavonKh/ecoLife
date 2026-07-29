/**
 * Pure meal-forecast math: a guest eats a meal iff the meal instant falls in
 * the half-open stay interval [checkIn, checkOut). Cleaning buffer is ignored.
 */
import {
  addLocalDays,
  formatLocalDate,
  parseLocalDateTime,
  parseTimeOfDay,
} from '../common/utils/datetime';

export const DEFAULT_MEAL_BREAKFAST_TIME = '08:00';
export const DEFAULT_MEAL_LUNCH_TIME = '13:00';
export const DEFAULT_MEAL_DINNER_TIME = '19:00';
export const MEAL_FORECAST_MAX_DAYS = 90;

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export type MealTimes = Record<MealSlot, string>;

export const DEFAULT_MEAL_TIMES: MealTimes = {
  breakfast: DEFAULT_MEAL_BREAKFAST_TIME,
  lunch: DEFAULT_MEAL_LUNCH_TIME,
  dinner: DEFAULT_MEAL_DINNER_TIME,
};

export type StayForMeals = {
  checkIn: Date;
  checkOut: Date;
  guests: number;
};

export type DayMealCounts = {
  date: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  /** breakfast + lunch + dinner — covers for the kitchen that day. */
  total: number;
};

export function isPresentAtMeal(
  checkIn: Date,
  checkOut: Date,
  mealInstant: Date,
): boolean {
  return checkIn.getTime() <= mealInstant.getTime() && mealInstant.getTime() < checkOut.getTime();
}

export function mealInstantForDate(dateStr: string, timeHhMm: string): Date {
  return parseLocalDateTime(dateStr, timeHhMm, 'date');
}

export function enumerateDatesInclusive(from: string, to: string): string[] {
  const start = parseLocalDateTime(from, { hours: 0, minutes: 0 }, 'from');
  const end = parseLocalDateTime(to, { hours: 0, minutes: 0 }, 'to');
  if (end.getTime() < start.getTime()) {
    throw new Error('from must be <= to');
  }
  const days =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > MEAL_FORECAST_MAX_DAYS) {
    throw new Error(`range must be at most ${MEAL_FORECAST_MAX_DAYS} days`);
  }
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < days; i++) {
    out.push(formatLocalDate(cursor));
    cursor = addLocalDays(cursor, 1);
  }
  return out;
}

/**
 * Per-day counts. `Итого гостей/день` = breakfast + lunch + dinner
 * (порции / покрытия за день — удобно кухне).
 */
export function buildDayMealCounts(
  stays: StayForMeals[],
  dates: string[],
  mealTimes: MealTimes,
): DayMealCounts[] {
  const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
  return dates.map((date) => {
    const counts = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const stay of stays) {
      for (const slot of slots) {
        const instant = mealInstantForDate(date, mealTimes[slot]);
        if (isPresentAtMeal(stay.checkIn, stay.checkOut, instant)) {
          counts[slot] += stay.guests;
        }
      }
    }
    return {
      date,
      breakfast: counts.breakfast,
      lunch: counts.lunch,
      dinner: counts.dinner,
      total: counts.breakfast + counts.lunch + counts.dinner,
    };
  });
}

export function parseMealTimes(times: Partial<MealTimes> | undefined): MealTimes {
  const breakfast = times?.breakfast ?? DEFAULT_MEAL_BREAKFAST_TIME;
  const lunch = times?.lunch ?? DEFAULT_MEAL_LUNCH_TIME;
  const dinner = times?.dinner ?? DEFAULT_MEAL_DINNER_TIME;
  // Validate format early.
  parseTimeOfDay(breakfast, 'MEAL_BREAKFAST_TIME');
  parseTimeOfDay(lunch, 'MEAL_LUNCH_TIME');
  parseTimeOfDay(dinner, 'MEAL_DINNER_TIME');
  return { breakfast, lunch, dinner };
}
