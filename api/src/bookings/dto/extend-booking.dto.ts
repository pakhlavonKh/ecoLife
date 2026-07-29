import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Admin extend stay (TRANSFER.md §1, §4). */
export class ExtendBookingDto {
  @ApiProperty({ example: '2026-08-07' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  newCheckOut!: string;

  @ApiPropertyOptional({
    example: '12:00',
    description: 'Local check-out time HH:mm (default: current check-out time)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'newCheckOutTime must be HH:mm',
  })
  newCheckOutTime?: string;

  @ApiPropertyOptional({
    description:
      'Editable charge for added nights (UZS). Defaults to catalog age pricing.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  addedAmount?: number;

  @ApiPropertyOptional({
    description:
      'When same-room extend is blocked: preferred category for transfer offers ' +
      '(defaults to current room category).',
  })
  @IsOptional()
  @IsString()
  offerCategoryCode?: string;

  @ApiPropertyOptional({
    description:
      'If set with a free room, perform transfer+extend atomically onto that room ' +
      'for the extended tail (after a blocked extend offer).',
  })
  @IsOptional()
  @IsUUID()
  transferToRoomId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
