import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { AvailabilityQueryDto } from '../dto/availability-query.dto';

/**
 * Regression: public frontend sends snake_case query times
 * (`check_in_time` / `check_out_time`). forbidNonWhitelisted must accept them.
 */
describe('AvailabilityQueryDto (public + admin query contract)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: AvailabilityQueryDto,
    data: '',
  };

  async function transform(value: Record<string, unknown>) {
    return pipe.transform(value, metadata);
  }

  it('accepts check_in_time / check_out_time (snake_case from public frontend)', async () => {
    const dto = (await transform({
      check_in: '2031-08-01',
      check_out: '2031-08-03',
      check_in_time: '16:30',
      check_out_time: '10:15',
      category_code: 'standart',
      guests: '2',
    })) as AvailabilityQueryDto;

    expect(dto.check_in).toBe('2031-08-01');
    expect(dto.check_out).toBe('2031-08-03');
    expect(dto.check_in_time).toBe('16:30');
    expect(dto.check_out_time).toBe('10:15');
    expect(dto.category_code).toBe('standart');
    expect(dto.guests).toBe(2);
  });

  it('allows omitting times (defaults applied in service)', async () => {
    const dto = (await transform({
      check_in: '2031-08-01',
      check_out: '2031-08-03',
    })) as AvailabilityQueryDto;

    expect(dto.check_in_time).toBeUndefined();
    expect(dto.check_out_time).toBeUndefined();
  });

  it('rejects camelCase time aliases (contract is snake_case for query)', async () => {
    await expect(
      transform({
        check_in: '2031-08-01',
        check_out: '2031-08-03',
        checkInTime: '14:00',
        checkOutTime: '12:00',
      }),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          expect.stringMatching(/checkInTime/),
          expect.stringMatching(/checkOutTime/),
        ]),
      },
    });
  });

  it('rejects invalid HH:mm', async () => {
    await expect(
      transform({
        check_in: '2031-08-01',
        check_out: '2031-08-03',
        check_in_time: '25:00',
      }),
    ).rejects.toBeTruthy();
  });
});
