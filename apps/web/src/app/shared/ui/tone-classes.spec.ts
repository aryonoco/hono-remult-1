import { STATUS_TONES } from '@workspace/shared-domain';
import { MARKER_TONE_CLASS, SEVERITY_TILE_TONE, SPINE_TONE } from './tone-classes';

it('covers every StatusTone with literal classes', () => {
  const tones = [...new Set(Object.values(STATUS_TONES))];
  for (const t of tones) {
    expect(SPINE_TONE[t]).toContain('bg-status-');
    expect(SEVERITY_TILE_TONE[t]).toContain('text-surface');
    expect(MARKER_TONE_CLASS[t]).toBe(`fire-marker--${t}`);
  }
});
