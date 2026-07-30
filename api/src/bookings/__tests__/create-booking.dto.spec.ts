import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateBookingDto } from '../dto/create-booking.dto';

/**
 * Regression: public BookingModal posts camelCase body times
 * (`checkInTime` / `checkOutTime`). Must not be stripped by whitelist.
 */
describe('CreateBookingDto (public POST /bookings contract)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateBookingDto,
    data: '',
  };

  const base = {
    firstName: 'Ali',
    lastName: 'Karimov',
    phone: '+998901234567',
    roomId: '11111111-1111-4111-8111-111111111111',
    checkIn: '2031-08-01',
    checkOut: '2031-08-03',
    adults: 2,
  };

  async function transform(value: Record<string, unknown>) {
    return pipe.transform(value, metadata);
  }

  it('accepts checkInTime / checkOutTime (camelCase from public frontend)', async () => {
    const dto = (await transform({
      ...base,
      checkInTime: '18:00',
      checkOutTime: '11:00',
      children: 0,
      infants: 0,
      provider: 'mock',
    })) as CreateBookingDto;

    expect(dto.checkInTime).toBe('18:00');
    expect(dto.checkOutTime).toBe('11:00');
    expect(dto.checkIn).toBe('2031-08-01');
    expect(dto.checkOut).toBe('2031-08-03');
  });

  it('allows omitting times (defaults applied in service)', async () => {
    const dto = (await transform(base)) as CreateBookingDto;
    expect(dto.checkInTime).toBeUndefined();
    expect(dto.checkOutTime).toBeUndefined();
  });

  it('rejects snake_case time aliases on JSON body (contract is camelCase)', async () => {
    await expect(
      transform({
        ...base,
        check_in_time: '14:00',
        check_out_time: '12:00',
      }),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          expect.stringMatching(/check_in_time/),
          expect.stringMatching(/check_out_time/),
        ]),
      },
    });
  });
});
