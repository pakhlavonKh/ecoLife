import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentRecordStatus } from '@prisma/client';
import { formatIsoDate, parseIsoDate } from '../common/utils/dates';
import { formatGuestName } from '../common/utils/guest-name';
import { decimalToString } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(periodFrom?: string, periodTo?: string) {
    const today = parseIsoDate(formatIsoDate(new Date()));
    const from = periodFrom
      ? parseIsoDate(periodFrom, 'from')
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const to = periodTo
      ? parseIsoDate(periodTo, 'to')
      : today;

    const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

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
    ] = await Promise.all([
      this.prisma.booking.count({
        where: {
          checkIn: today,
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
          checkOut: today,
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
          checkIn: { gt: today },
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
          checkIn: { lte: today },
          checkOut: { gt: today },
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

    const todayArrivals = await this.prisma.booking.findMany({
      where: {
        checkIn: today,
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
        checkOut: today,
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

    const mapBrief = (
      b: (typeof todayArrivals)[number],
    ) => ({
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
      checkIn: b.checkIn.toISOString().slice(0, 10),
      checkOut: b.checkOut.toISOString().slice(0, 10),
    });

    return {
      today: formatIsoDate(today),
      period: {
        from: formatIsoDate(from),
        to: formatIsoDate(to),
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
      pendingPayments,
      arrivalsList: todayArrivals.map(mapBrief),
      departuresList: todayDepartures.map(mapBrief),
    };
  }
}
