import {
  occupyingBeds,
  assertValidGuestCounts,
  totalGuests,
} from '../guest-counts';

describe('guest-counts', () => {
  it('occupying beds exclude infants', () => {
    expect(
      occupyingBeds({ adults: 2, children: 1, infants: 1 }),
    ).toBe(3);
    expect(totalGuests({ adults: 2, children: 1, infants: 1 })).toBe(4);
  });

  it('requires at least one adult', () => {
    expect(() =>
      assertValidGuestCounts({ adults: 0, children: 1, infants: 0 }),
    ).toThrow(/adult/i);
  });
});
