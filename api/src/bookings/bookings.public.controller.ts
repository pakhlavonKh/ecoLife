import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StrictThrottle } from '../common/decorators/throttle-profiles.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('public / bookings')
@Controller('bookings')
export class BookingsPublicController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @StrictThrottle(8)
  @ApiOperation({
    summary:
      'Create online booking (whole room). When PAYMENTS_ENABLED=true: pending_payment + paymentUrl. When false (default): online_request pre-booking with requiresOperator=true (no invoice).',
  })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.createPublic(dto);
  }

  @Get('by-code/:publicCode')
  @StrictThrottle(30)
  @ApiOperation({ summary: 'Lookup booking by public code (e.g. BK-3F7A)' })
  getByCode(@Param('publicCode') publicCode: string) {
    return this.bookingsService.getByPublicCode(publicCode.toUpperCase());
  }
}
