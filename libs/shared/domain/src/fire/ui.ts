import type { FireStatus } from './enums';

// Semantic visual tone for a fire status. The nine operational statuses collapse onto six tones that
// the UI colours consistently. This module stays framework-free (no Tailwind, no Angular): the web app
// maps each tone to theme-aware design tokens in status-badge.ts, so dark mode and theme overrides live there.
export type StatusTone = 'going' | 'contained' | 'controlled' | 'safe' | 'neutral' | 'missing';

export const STATUS_TONES: Readonly<Record<FireStatus, StatusTone>> = {
  going: 'going',
  contained: 'contained',
  underControlFirst: 'controlled',
  underControlSecond: 'controlled',
  safe: 'safe',
  safeOverrun: 'safe',
  safeNotFound: 'neutral',
  safeFalseAlarm: 'neutral',
  notFound: 'missing',
};

export function statusTone(status: FireStatus): StatusTone {
  return STATUS_TONES[status];
}
