import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { decimalToString } from '../common/utils/money';
import { normalizePhoneE164 } from '../common/utils/phone';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(search?: string) {
    const where: Prisma.CustomerWhereInput = {};
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { phone: { contains: q } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.customer.findMany({
      where,
      include: { _count: { select: { bookings: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return rows.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      notes: c.notes,
      bookingsCount: c._count.bookings,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        bookings: {
          include: {
            payments: { orderBy: { createdAt: 'desc' } },
            bookingRooms: {
              include: {
                room: { include: { cottage: true, category: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      notes: customer.notes,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      bookings: customer.bookings.map((b) => ({
        id: b.id,
        publicCode: b.publicCode,
        checkIn: b.checkIn.toISOString().slice(0, 10),
        checkOut: b.checkOut.toISOString().slice(0, 10),
        status: b.status,
        paymentStatus: b.paymentStatus,
        totalAmount: decimalToString(b.totalAmount),
        depositAmount: decimalToString(b.depositAmount),
        paidAmount: decimalToString(b.paidAmount),
        remainingAmount: decimalToString(b.remainingAmount),
        source: b.source,
        rooms: b.bookingRooms.map((br) => ({
          number: br.room.number,
          cottageName: br.room.cottage.name,
          categoryCode: br.room.category.code,
        })),
        payments: b.payments.map((p) => ({
          id: p.id,
          provider: p.provider,
          amount: decimalToString(p.amount),
          status: p.status,
          currency: p.currency,
          createdAt: p.createdAt,
        })),
      })),
    };
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    actor: { type: ActorType; id?: string },
  ) {
    const current = await this.prisma.customer.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Customer not found');
    }

    let phone = current.phone;
    if (dto.phone !== undefined) {
      try {
        phone = normalizePhoneE164(dto.phone);
      } catch {
        throw new BadRequestException(
          'phone must be a valid Uzbekistan number (+998…)',
        );
      }
    }

    const before = {
      firstName: current.firstName,
      lastName: current.lastName,
      phone: current.phone,
      notes: current.notes,
    };

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.phone !== undefined ? { phone } : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes.trim() || null }
          : {}),
      },
    });

    await this.audit.write({
      actor,
      entity: 'customer',
      entityId: id,
      action: 'update',
      diff: {
        before,
        after: {
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          notes: updated.notes,
        },
      },
    });

    return this.getById(id);
  }
}
