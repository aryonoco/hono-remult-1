import type { FirePerimeter, StatusTone } from '@workspace/shared-domain';

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

// Map fire-extent polygon classes (the `.fire-polygon--*` globals in styles.scss). Leaflet applies the
// className to the rendered GeoJSON `<path>`; the component styles fill/stroke with the status tokens.
// Whole static literals, mirroring `MARKER_TONE_CLASS` — never composed at runtime.
export const POLYGON_TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  going: 'fire-polygon--going',
  contained: 'fire-polygon--contained',
  controlled: 'fire-polygon--controlled',
  safe: 'fire-polygon--safe',
  neutral: 'fire-polygon--neutral',
  missing: 'fire-polygon--missing',
};

// Shared map-point shape consumed by OverviewComponent and IncidentMapComponent.
export interface MapPoint {
  lat: number;
  lng: number;
  tone: StatusTone;
  name: string;
  // Fire extent in hectares. When > 0 (and no `perimeter`) the map draws an area-sized circle (an area
  // estimate) around the centroid pin; absent/0 falls back to a plain toned pin (FIRE-AREA-4/5).
  areaHa?: number;
  // The true mapped fire extent as a GeoJSON Polygon (WGS84 [lng, lat]). When present the map renders
  // the polygon itself — the highest-fidelity extent — taking precedence over the area-circle estimate
  // and the bare pin in the render fallback chain (FIRE-AREA-5). Explicitly `| undefined` so callers can
  // project `firePerimeterGeo ?? undefined` under `exactOptionalPropertyTypes`.
  perimeter?: FirePerimeter | undefined;
  // The fire's status label, surfaced in the marker title/alt and the SVG-fallback list so colour is
  // never the sole signal (MAP-3).
  status?: string;
}
