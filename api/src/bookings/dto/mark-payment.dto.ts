import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MANUAL_PAYMENT_PROVIDERS } from '../../payments/manual-payment.constants';

export class MarkPaymentAmountDto {
  @ApiProperty({
    description:
      'Amount in UZS. Omit to pay the remaining balance in full.',
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

export class MarkPaymentDto extends MarkPaymentAmountDto {
  @ApiProperty({
    description:
      'Offline payment method. Online providers (payme/click) are set by webhooks only.',
    enum: MANUAL_PAYMENT_PROVIDERS,
    example: 'cash',
  })
  @IsIn([...MANUAL_PAYMENT_PROVIDERS])
  provider!: (typeof MANUAL_PAYMENT_PROVIDERS)[number];
}
