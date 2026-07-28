import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'check_in must be YYYY-MM-DD',
  })
  check_in!: string;

  @ApiProperty({ example: '2026-08-03' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'check_out must be YYYY-MM-DD',
  })
  check_out!: string;

  @ApiPropertyOptional({
    description: 'Filter rooms by category code (lux | standart)',
  })
  @IsOptional()
  @IsString()
  category_code?: string;

  @ApiPropertyOptional({
    description: 'Minimum room capacity (best-fit when listing rooms)',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guests?: number;

  @ApiPropertyOptional({
    description:
      'When editing a booking, exclude its beds from remainingBeds calculation',
  })
  @IsOptional()
  @IsUUID()
  exclude_booking_id?: string;
}
