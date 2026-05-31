import { describe, expect, it } from 'vitest';

import { DEV_USERS } from './dev-users';
import { DISTRICT_OPERATORS, OPERATORS, operatorName, STATE_OPERATORS } from './operators';

// The 16 DEECA fire-district codes the showcase recognises.
const DISTRICT_CODES = [12, 13, 14, 15, 21, 22, 34, 36, 37, 38, 41, 44, 45, 47, 52, 53];

describe('operator author pool', () => {
  it('has unique ids across the whole roster', () => {
    const ids = OPERATORS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every operator a trimmed, non-empty display name', () => {
    for (const o of OPERATORS) {
      expect(o.name.length).toBeGreaterThan(0);
      expect(o.name).toBe(o.name.trim());
    }
  });

  it('marks state operators as cross-district and district operators as district-scoped', () => {
    expect(STATE_OPERATORS.every((o) => o.districtId === null)).toBe(true);
    expect(DISTRICT_OPERATORS.every((o) => typeof o.districtId === 'number')).toBe(true);
  });

  it('covers every one of the 16 DEECA districts', () => {
    const covered = new Set(DISTRICT_OPERATORS.map((o) => o.districtId));
    expect([...covered].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(DISTRICT_CODES);
  });
});

describe('operatorName', () => {
  it('resolves operator ids to their display name', () => {
    expect(operatorName('op-12-1')).toBe('Hamish Calder');
  });

  it('resolves dev-user ids to their display name', () => {
    const [first] = DEV_USERS;
    expect(first).toBeDefined();
    if (first) {
      expect(operatorName(first.id)).toBe(first.name);
    }
  });

  it('passes unknown ids through unchanged', () => {
    expect(operatorName('not-a-real-author')).toBe('not-a-real-author');
  });
});
