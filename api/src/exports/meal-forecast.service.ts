import {
  BadRequestException,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus } from '@prisma/client';
import {
  addLocalDays,
  formatLocalDate,
  parseLocalDateTime,
} from '../common/utils/datetime';
import { PrismaService } from '../prisma/prisma.service';
import {
  MEAL_FORECAST_MAX_DAYS,
  buildDayMealCounts,
  enumerateDatesInclusive,
  parseMealTimes,
  type MealTimes,
  type StayForMeals,
} from './meal-forecast.engine';
import { formatExportDateTime } from './meal-forecast.format';
import { buildMealForecastPdf } from './meal-forecast.pdf';
import type { MealForecastRoomRow } from './meal-forecast.types';
import { buildMealForecastXlsx } from './meal-forecast.xlsx';

/** Paid / confirmed stays for kitchen — unpaid holds excluded by default. */
export const MEAL_FORECAST_STATUSES: readonly BookingStatus[] = [
  BookingStatus.deposit_paid,
  BookingStatus.confirmed,
  BookingStatus.checked_in,
];

@Injectable()
export class MealForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getMealTimes(): MealTimes {
    return parseMealTimes({
      breakfast: this.config.get<string>('MEAL_BREAKFAST_TIME') ?? undefined,
      lunch: this.config.get<string>('MEAL_LUNCH_TIME') ?? undefined,
      dinner: this.config.get<string>('MEAL_DINNER_TIME') ?? undefined,
    });
  }

  async getForecastData(opts: {
    from?: string;
    to?: string;
    includePending?: boolean;
  }) {
    const payload = await this.getForecastPayload(opts);
    return payload;
  }

  async buildExport(opts: {
    from?: string;
    to?: string;
    format: 'xlsx' | 'pdf';
    includePending?: boolean;
  }): Promise<{ file: StreamableFile; filename: string }> {
    const payload = await this.getForecastPayload(opts);
    const { from, to } = payload;

    const buffer =
      opts.format === 'pdf'
        ? await buildMealForecastPdf(payload)
        : await buildMealForecastXlsx(payload);

    const filename = `meal-forecast_${from}_${to}.${opts.format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const contentType =
      opts.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    return {
      filename,
      file: new StreamableFile(buffer, {
        type: contentType,
        disposition: `attachment; filename="${filename}"`,
      }),
    };
  }

  private async getForecastPayload(opts: {
    from?: string;
    to?: string;
    includePending?: boolean;
  }) {
    const today = formatLocalDate(new Date());
    const from = opts.from || today;
    const to = opts.to || from;
    this.assertDateRange(from, to);

    const mealTimes = this.getMealTimes();
    const dates = enumerateDatesInclusive(from, to);

    // Any stay that could cover a meal in [from, to].
    const rangeStart = parseLocalDateTime(from, mealTimes.breakfast, 'from');
    const fetchEnd = addLocalDays(
      parseLocalDateTime(to, { hours: 23, minutes: 59 }, 'to'),
      1,
    );

    const statuses: BookingStatus[] = opts.includePending
      ? [BookingStatus.pending_payment, ...MEAL_FORECAST_STATUSES]
      : [...MEAL_FORECAST_STATUSES];

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: statuses },
        checkIn: { lt: fetchEnd },
        checkOut: { gt: rangeStart },
      },
      include: {
        bookingRooms: {
          where: { isActive: true },
          include: {
            room: { include: { cottage: true } },
          },
          orderBy: { room: { number: 'asc' } },
        },
      },
      orderBy: [{ checkIn: 'asc' }, { publicCode: 'asc' }],
    });

    const now = Date.now();
    const activeBookings = bookings.filter((b) => {
      if (b.status !== BookingStatus.pending_payment) return true;
      return b.expiresAt == null || b.expiresAt.getTime() > now;
    });

    const stays: StayForMeals[] = activeBookings.map((b) => ({
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      adults: b.adults,
      children: b.children,
      infants: b.infants,
      guests: b.adults + b.children + b.infants,
    }));

    const days = buildDayMealCounts(stays, dates, mealTimes);

    const rooms: MealForecastRoomRow[] = [];
    const seen = new Set<string>();
    for (const b of activeBookings) {
      const contributes = dates.some((date) =>
        (['breakfast', 'lunch', 'dinner'] as const).some((slot) => {
          const instant = parseLocalDateTime(date, mealTimes[slot], 'date');
          return (
            b.checkIn.getTime() <= instant.getTime() &&
            instant.getTime() < b.checkOut.getTime()
          );
        }),
      );
      if (!contributes) continue;

      for (const br of b.bookingRooms) {
        const key = `${br.roomId}:${b.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rooms.push({
          roomNumber: br.room.number,
          cottageName: br.room.cottage.name,
          adults: b.adults,
          children: b.children,
          infants: b.infants,
          guests: br.bedsBooked,
          checkInLabel: formatExportDateTime(b.checkIn),
          checkOutLabel: formatExportDateTime(b.checkOut),
          checkIn: b.checkIn,
          checkOut: b.checkOut,
        });
      }
    }

    rooms.sort((a, b) => {
      const byRoom = a.roomNumber.localeCompare(b.roomNumber, 'ru', {
        numeric: true,
      });
      if (byRoom !== 0) return byRoom;
      return a.checkIn.getTime() - b.checkIn.getTime();
    });

    return { from, to, mealTimes, days, rooms };
  }

  private assertDateRange(from: string, to: string): void {
    try {
      enumerateDatesInclusive(from, to);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid date range';
      if (message.includes('at most')) {
        throw new BadRequestException(
          `Диапазон не больше ${MEAL_FORECAST_MAX_DAYS} дней`,
        );
      }
      if (message.includes('from must')) {
        throw new BadRequestException('from must be <= to');
      }
      throw new BadRequestException(message);
    }
  }
}
