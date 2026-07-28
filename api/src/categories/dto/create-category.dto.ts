import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CATEGORY_IMAGES_MAX_COUNT } from '../../common/utils/category-images';

export class CreateCategoryDto {
  @ApiProperty({ example: 'lux' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Люкс' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 50, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  depositPercent!: number;

  @ApiProperty({
    example: '800000.00',
    description: 'Цена за место / ночь (UZS)',
  })
  @IsNumberString()
  pricePerBedPerNight!: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Image URLs (http/https) or /uploads/... paths. Prefer POST .../images for uploads.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORY_IMAGES_MAX_COUNT)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  images?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
