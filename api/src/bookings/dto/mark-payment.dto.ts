import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkPaymentDto {
  @ApiProperty({
    description:
      'Cash amount in UZS. Omit to pay the remaining balance in full.',
    example: '500000.00',
    required: false,
  })
  @IsOptional()
  @IsNumberString()
  amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
