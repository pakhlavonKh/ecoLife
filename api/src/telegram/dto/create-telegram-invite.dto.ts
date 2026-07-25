import { ApiProperty } from '@nestjs/swagger';
import { TelegramStaffRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateTelegramInviteDto {
  @ApiProperty({ enum: TelegramStaffRole, example: TelegramStaffRole.manager })
  @IsEnum(TelegramStaffRole)
  role!: TelegramStaffRole;
}
