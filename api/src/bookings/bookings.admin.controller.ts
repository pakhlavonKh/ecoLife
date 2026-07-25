import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminThrottle } from '../common/decorators/throttle-profiles.decorator';
import { ActorType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';
import { PaymentsService } from '../payments/payments.service';
import { BookingsService } from './bookings.service';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CreateManualBookingDto } from './dto/create-manual-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiTags('admin / bookings')
@ApiBearerAuth()
@AdminThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager)
@Controller('admin')
export class BookingsAdminController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('bookings')
  @ApiOperation({ summary: 'List bookings with search and filters' })
  list(@Query() query: ListBookingsQueryDto) {
    return this.bookingsService.listAdmin({
      status: query.status,
      paymentStatus: query.paymentStatus,
      search: query.search,
      categoryId: query.categoryId,
      categoryCode: query.categoryCode,
      cottageId: query.cottageId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Calendar grid data (rooms × days)' })
  calendar(@Query() query: CalendarQueryDto) {
    return this.bookingsService.getCalendar(query.from, query.to);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get booking by id' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.getById(id);
  }

  @Post('bookings')
  @ApiOperation({
    summary:
      'Create manual booking (confirmed, no online payment, same availability engine)',
  })
  createManual(
    @Body() dto: CreateManualBookingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.createManual(dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Patch('bookings/:id')
  @ApiOperation({ summary: 'Edit booking (guest, dates, room, notes)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.updateBooking(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Patch('bookings/:id/status')
  @ApiOperation({
    summary:
      'Transition booking status (illegal transitions → 422). Releases inventory on cancel/check-out.',
  })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.transitionStatus(id, dto.status, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Post('bookings/:id/payments/cash')
  @ApiOperation({
    summary:
      'Record offline cash payment. When paid_amount == total → paid_full.',
  })
  markCash(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaymentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.recordCashPayment(id, dto.amount, {
      type: ActorType.admin,
      id: user.id,
      note: dto.note,
    });
  }
}
