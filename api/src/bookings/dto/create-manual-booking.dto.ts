import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateManualBookingDto {
  @ApiProperty({ example: 'Ali' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({
    example: 'Karimov',
    description: 'Optional — may be empty',
  })
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ description: 'Physical room UUID' })
  @IsUUID()
  roomId!: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn!: string;

  @ApiProperty({ example: '2026-08-03' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut!: string;

  @ApiPropertyOptional({
    example: '14:00',
    description: 'Local check-in time HH:mm (default from CHECK_IN_TIME / 14:00)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkInTime must be HH:mm',
  })
  checkInTime?: string;

  @ApiPropertyOptional({
    example: '12:00',
    description: 'Local check-out time HH:mm (default from CHECK_OUT_TIME / 12:00)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkOutTime must be HH:mm',
  })
  checkOutTime?: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guests!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
