import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'manager@ecolife.local' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Manager Name' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.manager })
  @IsEnum(UserRole)
  role!: UserRole;
}
