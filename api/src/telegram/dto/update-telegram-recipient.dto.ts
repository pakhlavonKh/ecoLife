import { ApiPropertyOptional } from '@nestjs/swagger';
import { TelegramStaffRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateTelegramRecipientDto {
  @ApiPropertyOptional({ example: 'Зухра — уборщица' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: TelegramStaffRole })
  @IsOptional()
  @IsEnum(TelegramStaffRole)
  role?: TelegramStaffRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
