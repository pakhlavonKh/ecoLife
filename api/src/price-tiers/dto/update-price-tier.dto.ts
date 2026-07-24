import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class UpdatePriceTierDto {
  @ApiProperty({ example: '1500000.00', description: 'UZS per night' })
  @IsNumberString()
  pricePerNight!: string;
}
