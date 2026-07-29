import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class MealForecastQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from must be YYYY-MM-DD',
  })
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to must be YYYY-MM-DD',
  })
  to!: string;

  @IsIn(['xlsx', 'pdf'])
  format!: 'xlsx' | 'pdf';

  /** Include unpaid pending_payment holds (default false — kitchen skips no-shows). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  include_pending?: boolean;
}
