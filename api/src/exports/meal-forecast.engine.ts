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

export type GuestCountBreakdown = {
  adults: number;
  children: number;
  infants: number;
  total: number;
};

export type StayForMeals = {
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  infants: number;
  guests: number;
};

export type DayMealCounts = {
  date: string;
  breakfast: GuestCountBreakdown;
  lunch: GuestCountBreakdown;
  dinner: GuestCountBreakdown;
  /** breakfast + lunch + dinner — total portions served that day. */
  total: GuestCountBreakdown;
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
 * Per-day counts with adults, children, infants breakdown for each meal.
 */
export function buildDayMealCounts(
  stays: StayForMeals[],
  dates: string[],
  mealTimes: MealTimes,
): DayMealCounts[] {
  const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
  return dates.map((date) => {
    const counts: Record<MealSlot, GuestCountBreakdown> = {
      breakfast: { adults: 0, children: 0, infants: 0, total: 0 },
      lunch: { adults: 0, children: 0, infants: 0, total: 0 },
      dinner: { adults: 0, children: 0, infants: 0, total: 0 },
    };

    for (const stay of stays) {
      for (const slot of slots) {
        const instant = mealInstantForDate(date, mealTimes[slot]);
        if (isPresentAtMeal(stay.checkIn, stay.checkOut, instant)) {
          const a = stay.adults ?? 0;
          const c = stay.children ?? 0;
          const inf = stay.infants ?? 0;
          const tot = stay.guests ?? (a + c + inf);

          counts[slot].adults += a;
          counts[slot].children += c;
          counts[slot].infants += inf;
          counts[slot].total += tot;
        }
      }
    }

    const dayTotal: GuestCountBreakdown = {
      adults: counts.breakfast.adults + counts.lunch.adults + counts.dinner.adults,
      children:
        counts.breakfast.children + counts.lunch.children + counts.dinner.children,
      infants:
        counts.breakfast.infants + counts.lunch.infants + counts.dinner.infants,
      total: counts.breakfast.total + counts.lunch.total + counts.dinner.total,
    };

    return {
      date,
      breakfast: counts.breakfast,
      lunch: counts.lunch,
      dinner: counts.dinner,
      total: dayTotal,
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
