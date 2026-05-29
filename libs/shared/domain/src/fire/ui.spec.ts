import { FIRE_STATUS_VALUES } from './enums';
import { STATUS_BADGE_BASE, STATUS_BADGE_CLASSES } from './ui';

describe('ui badge classes', () => {
  it('has a non-empty badge class for every FireStatus', () => {
    for (const status of FIRE_STATUS_VALUES) {
      expect(STATUS_BADGE_CLASSES[status]).toBeTruthy();
    }
  });

  it('exposes a base badge class', () => {
    expect(STATUS_BADGE_BASE.length).toBeGreaterThan(0);
  });
});
