import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: '201' })
  @IsString()
  @MinLength(1)
  number!: string;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cottageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({
    description: 'Per-room price override (UZS). Omit or null = use tier.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumberString()
  priceOverride?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
