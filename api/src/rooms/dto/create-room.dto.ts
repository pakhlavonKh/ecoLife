import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
