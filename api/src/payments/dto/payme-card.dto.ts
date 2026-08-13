import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class CreatePaymeCardDto {
  @ApiProperty({ description: 'Payment ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  paymentId!: string;

  @ApiProperty({ description: 'Card number (16 digits)', example: '8600060921090842' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\d\s]{16,19}$/, {
    message: 'Card number must be 16 digits',
  })
  number!: string;

  @ApiProperty({ description: 'Card expiration date (MM/YY)', example: '03/99' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])\/?([0-9]{2})$/, {
    message: 'Expire must be MM/YY',
  })
  expire!: string;
}

export class PayPaymeReceiptDto {
  @ApiProperty({ description: 'Payment ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  paymentId!: string;

  @ApiProperty({ description: 'Card token from cards.create' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: '6-digit SMS OTP code', example: '666666' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, {
    message: 'Code must be a 6-digit SMS OTP',
  })
  code!: string;
}
