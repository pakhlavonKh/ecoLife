import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePriceTierDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiProperty({ example: '800000.00', description: 'UZS per night' })
  @IsNumberString()
  pricePerNight!: string;
}
