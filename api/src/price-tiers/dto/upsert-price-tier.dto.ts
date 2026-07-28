import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpsertPriceTierDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiProperty({ example: '600000.00' })
  @IsNumberString()
  pricePerNight!: string;
}
