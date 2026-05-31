import { FIRE_STATUS_VALUES } from './enums';
import { STATUS_TONES, type StatusTone, statusTone } from './ui';

const TONES: readonly StatusTone[] = [
  'going',
  'contained',
  'controlled',
  'safe',
  'neutral',
  'missing',
];

describe('status tones', () => {
  it('maps every FireStatus to a known tone', () => {
    for (const status of FIRE_STATUS_VALUES) {
      expect(TONES).toContain(STATUS_TONES[status]);
    }
  });

  it('statusTone() returns the mapped tone for every FireStatus', () => {
    for (const status of FIRE_STATUS_VALUES) {
      expect(statusTone(status)).toBe(STATUS_TONES[status]);
    }
  });
});
