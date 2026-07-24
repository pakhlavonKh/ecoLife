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
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('public / bookings')
@Controller('bookings')
export class BookingsPublicController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create online booking (whole room). Returns pending_payment hold + deposit paymentUrl.',
  })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.createPublic(dto);
  }

  @Get('by-code/:publicCode')
  @ApiOperation({ summary: 'Lookup booking by public code (e.g. BK-3F7A)' })
  getByCode(@Param('publicCode') publicCode: string) {
    return this.bookingsService.getByPublicCode(publicCode.toUpperCase());
  }
}
