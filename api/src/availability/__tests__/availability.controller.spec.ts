import { AvailabilityController } from '../availability.controller';
import { AvailabilityService } from '../availability.service';
import { AvailabilityQueryDto } from '../dto/availability-query.dto';

describe('AvailabilityController', () => {
  it('forwards check_in_time / check_out_time into the availability engine', async () => {
    const getPublicAvailability = jest.fn().mockResolvedValue({
      checkIn: '2031-08-01',
      checkOut: '2031-08-02',
      checkInTime: '16:00',
      checkOutTime: '10:00',
      categories: [],
    });
    const controller = new AvailabilityController({
      getPublicAvailability,
    } as unknown as AvailabilityService);

    const query = Object.assign(new AvailabilityQueryDto(), {
      check_in: '2031-08-01',
      check_out: '2031-08-02',
      check_in_time: '16:00',
      check_out_time: '10:00',
      category_code: 'lux',
      guests: 4,
    });

    await controller.get(query);

    expect(getPublicAvailability).toHaveBeenCalledWith(
      '2031-08-01',
      '2031-08-02',
      {
        categoryCode: 'lux',
        guests: 4,
        checkInTime: '16:00',
        checkOutTime: '10:00',
      },
    );
  });
});
