import { FireStatus, TERMINAL_STATUSES } from '@workspace/shared-domain';
import { isTerminalStatus } from './fire-status';

describe('isTerminalStatus', () => {
  it('is true for every terminal status', () => {
    expect(isTerminalStatus(FireStatus.safe)).toBe(true);
    for (const s of TERMINAL_STATUSES) {
      expect(isTerminalStatus(s)).toBe(true);
    }
  });

  it('is false for active and contained statuses', () => {
    expect(isTerminalStatus(FireStatus.going)).toBe(false);
    expect(isTerminalStatus(FireStatus.contained)).toBe(false);
    expect(isTerminalStatus(FireStatus.underControlFirst)).toBe(false);
    expect(isTerminalStatus(FireStatus.underControlSecond)).toBe(false);
  });
});
