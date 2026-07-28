import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRoomLockDto {
  @ApiProperty()
  @IsUUID()
  roomId!: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn!: string;

  @ApiProperty({ example: '2026-08-05' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut!: string;

  @ApiPropertyOptional({
    example: '14:00',
    description: 'Local lock start time HH:mm (default CHECK_IN_TIME / 14:00)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkInTime must be HH:mm',
  })
  checkInTime?: string;

  @ApiPropertyOptional({
    example: '12:00',
    description: 'Local lock end time HH:mm (default CHECK_OUT_TIME / 12:00)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkOutTime must be HH:mm',
  })
  checkOutTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Optional booking that owns this whole-room lock',
  })
  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
