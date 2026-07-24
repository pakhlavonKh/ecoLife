import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@ecolife.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMeAdmin123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
