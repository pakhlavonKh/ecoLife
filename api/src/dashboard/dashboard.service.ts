import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentRecordStatus } from '@prisma/client';
import {
  addLocalDays,
  formatLocalDate,
  formatLocalTime,
  localParts,
  parseLocalDateTime,
  startOfLocalDay,
  zonedTimeToUtc,
} from '../common/utils/datetime';
import { formatGuestName } from '../common/utils/guest-name';
import { decimalToString } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(periodFrom?: string, periodTo?: string) {
    // Stay boundaries are instants now, so "today" is a local day window, not one date.
    const dayStart = startOfLocalDay(new Date());
    const dayEnd = addLocalDays(dayStart, 1);
    const nowParts = localParts(dayStart);

    const from = periodFrom
      ? parseLocalDateTime(periodFrom, undefined, 'from')
      : zonedTimeToUtc(nowParts.year, nowParts.month, 1);
    const to = periodTo
      ? parseLocalDateTime(periodTo, undefined, 'to')
      : dayStart;

    const toExclusive = addLocalDays(to, 1);

    const [
      arrivals,
      departures,
      activeGuests,
      upcoming,
      totalBookings,
      pendingPayments,
      totalBedsAgg,
      occupiedBedsToday,
      revenueAgg,
      revenueByProvider,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: {
          checkIn: { gte: dayStart, lt: dayEnd },
          status: {
            in: [
              BookingStatus.deposit_paid,
              BookingStatus.confirmed,
              BookingStatus.checked_in,
            ],
          },
        },
      }),
      this.prisma.booking.count({
        where: {
          checkOut: { gte: dayStart, lt: dayEnd },
          status: {
            in: [BookingStatus.checked_in, BookingStatus.checked_out],
          },
        },
      }),
      this.prisma.booking.count({
        where: { status: BookingStatus.checked_in },
      }),
      this.prisma.booking.count({
        where: {
          checkIn: { gte: dayEnd },
          status: {
            in: [
              BookingStatus.pending_payment,
              BookingStatus.deposit_paid,
              BookingStatus.confirmed,
            ],
          },
        },
      }),
      this.prisma.booking.count(),
      this.prisma.booking.count({
        where: {
          status: BookingStatus.pending_payment,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      }),
      this.prisma.room.aggregate({
        where: { isActive: true },
        _sum: { capacity: true },
      }),
      this.prisma.bookingRoom.findMany({
        where: {
          isActive: true,
          checkIn: { lt: dayEnd },
          checkOut: { gt: dayStart },
          booking: {
            status: {
              in: [
                BookingStatus.deposit_paid,
                BookingStatus.confirmed,
                BookingStatus.checked_in,
              ],
            },
          },
        },
        select: { bedsBooked: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentRecordStatus.succeeded,
          createdAt: { gte: from, lt: toExclusive },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['provider'],
        where: {
          status: PaymentRecordStatus.succeeded,
          createdAt: { gte: from, lt: toExclusive },
        },
        _sum: { amount: true },
      }),
    ]);

    const totalBeds = totalBedsAgg._sum.capacity ?? 0;
    const occupiedBeds = occupiedBedsToday.reduce(
      (sum, r) => sum + r.bedsBooked,
      0,
    );
    const occupancyPercent =
      totalBeds > 0
        ? Math.round((occupiedBeds / totalBeds) * 1000) / 10
        : 0;

    const amountOf = (providers: string[]) => {
      let sum = 0;
      for (const row of revenueByProvider) {
        if (providers.includes(row.provider)) {
          sum += Number(row._sum.amount ?? 0);
        }
      }
      return decimalToString(sum);
    };

    const revenueByMethod = {
      cash: amountOf(['cash']),
      card: amountOf(['card']),
      transfer: amountOf(['transfer']),
      terminal: amountOf(['terminal']),
      online: amountOf(['payme', 'click', 'mock']),
    };

    const todayArrivals = await this.prisma.booking.findMany({
      where: {
        checkIn: { gte: dayStart, lt: dayEnd },
        status: {
          in: [
            BookingStatus.deposit_paid,
            BookingStatus.confirmed,
            BookingStatus.checked_in,
          ],
        },
      },
      include: {
        customer: true,
        bookingRooms: {
          include: { room: { include: { cottage: true } } },
        },
      },
      orderBy: { checkIn: 'asc' },
      take: 50,
    });

    const todayDepartures = await this.prisma.booking.findMany({
      where: {
        checkOut: { gte: dayStart, lt: dayEnd },
        status: {
          in: [BookingStatus.checked_in, BookingStatus.checked_out],
        },
      },
      include: {
        customer: true,
        bookingRooms: {
          include: { room: { include: { cottage: true } } },
        },
      },
      orderBy: { checkOut: 'asc' },
      take: 50,
    });

    const mapBrief = (b: (typeof todayArrivals)[number]) => ({
      id: b.id,
      publicCode: b.publicCode,
      status: b.status,
      customerName: formatGuestName(
        b.customer.firstName,
        b.customer.lastName,
      ),
      phone: b.customer.phone,
      rooms: b.bookingRooms.map(
        (br) => `${br.room.cottage.name} / ${br.room.number}`,
      ),
      checkIn: formatLocalDate(b.checkIn),
      checkOut: formatLocalDate(b.checkOut),
      checkInTime: formatLocalTime(b.checkIn),
      checkOutTime: formatLocalTime(b.checkOut),
      checkInAt: b.checkIn.toISOString(),
      checkOutAt: b.checkOut.toISOString(),
    });

    return {
      today: formatLocalDate(dayStart),
      period: {
        from: formatLocalDate(from),
        to: formatLocalDate(to),
      },
      arrivalsToday: arrivals,
      departuresToday: departures,
      activeGuests,
      upcomingBookings: upcoming,
      totalBookings,
      occupancyPercent,
      occupiedBeds,
      totalBeds,
      revenue: decimalToString(revenueAgg._sum.amount ?? 0),
      revenueByMethod,
      pendingPayments,
      arrivalsList: todayArrivals.map(mapBrief),
      departuresList: todayDepartures.map(mapBrief),
    };
  }

  /**
   * Owner /stats report for an inclusive local-date range [fromDate, toDate].
   * Revenue is by payment createdAt (cash-in), not booking/check-in date.
   */
  async getOwnerPeriodStats(fromDate: string, toDate: string) {
    const from = parseLocalDateTime(fromDate, undefined, 'from');
    const to = parseLocalDateTime(toDate, undefined, 'to');
    const toExclusive = addLocalDays(to, 1);
    const now = new Date();

    const arrivalStatuses: BookingStatus[] = [
      BookingStatus.deposit_paid,
      BookingStatus.confirmed,
      BookingStatus.checked_in,
      BookingStatus.checked_out,
    ];
    const departureStatuses: BookingStatus[] = [
      BookingStatus.checked_in,
      BookingStatus.checked_out,
    ];
    const stayingStatuses: BookingStatus[] = [
      BookingStatus.deposit_paid,
      BookingStatus.confirmed,
      BookingStatus.checked_in,
    ];

    const [arrivalBookings, departureCount, stayingBookings, revenueByProvider] =
      await Promise.all([
        this.prisma.booking.findMany({
          where: {
            checkIn: { gte: from, lt: toExclusive },
            status: { in: arrivalStatuses },
          },
          select: { bedsTotal: true },
        }),
        this.prisma.booking.count({
          where: {
            checkOut: { gte: from, lt: toExclusive },
            status: { in: departureStatuses },
          },
        }),
        this.prisma.booking.findMany({
          where: {
            checkIn: { lte: now },
            checkOut: { gt: now },
            status: { in: stayingStatuses },
          },
          select: { bedsTotal: true },
        }),
        this.prisma.payment.groupBy({
          by: ['provider'],
          where: {
            status: PaymentRecordStatus.succeeded,
            createdAt: { gte: from, lt: toExclusive },
          },
          _sum: { amount: true },
        }),
      ]);

    const arrivalsBookings = arrivalBookings.length;
    const arrivalsGuests = arrivalBookings.reduce(
      (sum, b) => sum + b.bedsTotal,
      0,
    );
    const stayingGuests = stayingBookings.reduce(
      (sum, b) => sum + b.bedsTotal,
      0,
    );

    const paymentsByProvider: Record<string, string> = {};
    let revenueTotal = 0;
    for (const row of revenueByProvider) {
      const amount = Number(row._sum.amount ?? 0);
      if (amount <= 0) continue;
      paymentsByProvider[row.provider] = decimalToString(amount);
      revenueTotal += amount;
    }

    return {
      period: {
        from: formatLocalDate(from),
        to: formatLocalDate(to),
      },
      arrivalsBookings,
      arrivalsGuests,
      departures: departureCount,
      stayingGuests,
      paymentsByProvider,
      revenue: decimalToString(revenueTotal),
    };
  }
}
