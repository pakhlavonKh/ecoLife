import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

@ApiTags('public / availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary:
      'Category availability for [check_in, check_out). Pass category_code + guests to include best-fit room list.',
  })
  get(@Query() query: AvailabilityQueryDto) {
    return this.availabilityService.getPublicAvailability(
      query.check_in,
      query.check_out,
      {
        categoryCode: query.category_code,
        guests: query.guests,
        checkInTime: query.check_in_time,
        checkOutTime: query.check_out_time,
      },
    );
  }
}
