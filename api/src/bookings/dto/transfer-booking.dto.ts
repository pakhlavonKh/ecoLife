import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/** Admin transfer / upgrade (TRANSFER.md §1–4). */
export class TransferBookingDto {
  @ApiProperty({ description: 'Target physical room UUID' })
  @IsUUID()
  roomId!: string;

  @ApiProperty({
    example: '2026-08-03',
    description:
      'Local date of the transfer instant. Must be on/after check-in and before check-out.',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transferDate!: string;

  @ApiPropertyOptional({
    example: '14:00',
    description:
      'Local time HH:mm (default: current segment check-in time, or 14:00). ' +
      'Use check-in date+time to move the whole stay before arrival.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'transferTime must be HH:mm',
  })
  transferTime?: string;

  @ApiPropertyOptional({
    description:
      'Editable upgrade surcharge (UZS). Ignored for same-class transfer. ' +
      'Defaults to catalog (new remaining − old remaining).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  surchargeAmount?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
