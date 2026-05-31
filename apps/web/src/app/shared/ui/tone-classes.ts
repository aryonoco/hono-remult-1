import type { StatusTone } from '@workspace/shared-domain';

// Status-spine fill classes (the thin accent rail on tiles/rows). Each value is a whole static literal so
// Tailwind keeps the utility in the build — never interpolate `bg-status-${tone}`.
export const SPINE_TONE: Readonly<Record<StatusTone, string>> = {
  going: 'bg-status-going',
  contained: 'bg-status-contained',
  controlled: 'bg-status-controlled',
  safe: 'bg-status-safe',
  neutral: 'bg-status-neutral',
  missing: 'bg-status-missing',
};

// Severity-tile fills: a solid tone surface with `text-surface` foreground for the level glyph.
export const SEVERITY_TILE_TONE: Readonly<Record<StatusTone, string>> = {
  going: 'bg-status-going text-surface',
  contained: 'bg-status-contained text-surface',
  controlled: 'bg-status-controlled text-surface',
  safe: 'bg-status-safe text-surface',
  neutral: 'bg-status-neutral text-surface',
  missing: 'bg-status-missing text-surface',
};

// Map-marker modifier classes (the `.fire-marker--*` globals defined in styles.scss).
export const MARKER_TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  going: 'fire-marker--going',
  contained: 'fire-marker--contained',
  controlled: 'fire-marker--controlled',
  safe: 'fire-marker--safe',
  neutral: 'fire-marker--neutral',
  missing: 'fire-marker--missing',
};

// Shared map-point shape consumed by OverviewComponent and IncidentMapComponent.
export interface MapPoint {
  lat: number;
  lng: number;
  tone: StatusTone;
  name: string;
}
