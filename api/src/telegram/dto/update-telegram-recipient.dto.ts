import { ApiPropertyOptional } from '@nestjs/swagger';
import { TelegramLanguage, TelegramStaffRole } from '@prisma/client';
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

  @ApiPropertyOptional({ enum: TelegramLanguage })
  @IsOptional()
  @IsEnum(TelegramLanguage)
  language?: TelegramLanguage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
