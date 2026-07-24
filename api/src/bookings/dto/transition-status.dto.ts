import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class TransitionStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @IsEnum(BookingStatus)
  status!: BookingStatus;
}
