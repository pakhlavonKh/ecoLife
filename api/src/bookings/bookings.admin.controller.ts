import {
  Body,
  Controller,
  Delete,
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
import { ExtendBookingDto } from './dto/extend-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { MarkPaymentAmountDto, MarkPaymentDto } from './dto/mark-payment.dto';
import { TransferBookingDto } from './dto/transfer-booking.dto';
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
      limit: query.limit,
      offset: query.offset,
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

  @Post('bookings/:id/transfer')
  @ApiOperation({
    summary:
      'Transfer / upgrade: split stay at transferAt, free old beds (no cleaning buffer) and occupy new room. Same class = no surcharge; upgrade surcharge editable.',
  })
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferBookingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.transferBooking(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Post('bookings/:id/extend')
  @ApiOperation({
    summary:
      'Extend checkout. If same room is blocked → 409 with transferOffers; retry with transferToRoomId to move the extension tail.',
  })
  extend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendBookingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.extendBooking(id, dto, {
      type: ActorType.admin,
      id: user.id,
    });
  }

  @Post('bookings/:id/payments')
  @ApiOperation({
    summary:
      'Record offline payment (cash / card / transfer / terminal). When paid_amount == total → paid_full. Online Payme/Click are set by webhooks only.',
  })
  markPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaymentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.recordManualPayment(
      id,
      dto.provider,
      dto.amount,
      {
        type: ActorType.admin,
        id: user.id,
        note: dto.note,
      },
    );
  }

  /** @deprecated Use POST …/payments with provider: "cash". */
  @Post('bookings/:id/payments/cash')
  @ApiOperation({
    summary: 'Record offline cash payment (alias of POST …/payments).',
    deprecated: true,
  })
  markCash(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaymentAmountDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.recordManualPayment(id, 'cash', dto.amount, {
      type: ActorType.admin,
      id: user.id,
      note: dto.note,
    });
  }

  @Delete('bookings/:id')
  @ApiOperation({ summary: 'Delete booking permanently from system history' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.deleteBooking(id, {
      type: ActorType.admin,
      id: user.id,
    });
  }
}
