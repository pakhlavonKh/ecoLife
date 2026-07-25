import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CalendarQueryDto {
  @ApiProperty({ example: '2026-07-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ example: '2026-07-31' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}
