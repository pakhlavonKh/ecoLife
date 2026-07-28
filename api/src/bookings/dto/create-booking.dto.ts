import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
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

export class CreateBookingDto {
  @ApiProperty({ example: 'Ali' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({
    example: 'Karimov',
    description: 'Optional — guests may leave surname empty (e.g. initials only)',
  })
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ description: 'Physical room UUID chosen by guest' })
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

  @ApiProperty({
    description: 'Number of guests / beds in this booking (must fit remaining beds)',
    minimum: 1,
  })
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

  @ApiPropertyOptional({
    enum: ['mock', 'payme', 'click'],
    description:
      'Payment provider for deposit invoice. Defaults to mock when enabled.',
  })
  @IsOptional()
  @IsIn(['mock', 'payme', 'click'])
  provider?: 'mock' | 'payme' | 'click';
}
