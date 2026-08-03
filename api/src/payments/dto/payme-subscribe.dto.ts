import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class PaymeCreateCardDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{16,20}$/, {
    message: 'Card number must be between 16 and 20 digits',
  })
  number!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Expiration date must be in MMYY format (4 digits)',
  })
  expire!: string;
}

export class PaymePayReceiptDto {
  @IsNotEmpty()
  @IsUUID()
  paymentId!: string;

  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  code?: string;
}
