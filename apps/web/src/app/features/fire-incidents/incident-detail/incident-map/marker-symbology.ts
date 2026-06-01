import type { StatusTone } from '@workspace/shared-domain';
import { MARKER_TONE_CLASS, type MapPoint } from '../../../../shared/ui/tone-classes';

// Pure presentation logic for the Leaflet "tag pin" markers — kept apart from the map component so it is
// testable in isolation and the component stays focused on Leaflet wiring. The marker is one cohesive SVG
// pin: a status-toned glyph head (graduated by incident level, heavier-cased when Major, beacon-pulsed
// when "loud") tapering to a pointer whose tip lands on the coordinate. The matching global CSS lives in
// styles.scss @layer utilities.

// Cap the animated beacon pulse to the highest-priority active fires so the overview never animates
// hundreds of markers at once (the pulse is the only motion; the pins themselves are static SVG/CSS).
const PULSE_CAP = 16;
// Marker stacking: a Major fire always wins overlaps, otherwise higher levels sit above lower ones.
const MAJOR_Z = 1000;
const LEVEL_Z_STEP = 100;
// Incident-level numerals (the values of the domain's LEVEL_ORDER). Level 1 is the default; only 2 and 3
// earn a larger pin, and absent/unknown folds to the default everywhere (one sentinel, used below).
const DEFAULT_LEVEL = 1;
const LEVEL_TWO = 2;
const LEVEL_THREE = 3;

// The pin silhouette: a rounded head (x 2..32, y 2..30, corner radius 9) tapering through a pointer to a
// tip at the very bottom of the viewBox — (17, 42) of `0 0 34 42` — so that bottom-anchoring the SVG puts
// the tip exactly on the coordinate at every level. The glyph nests in the head; the optional beacon pulse
// is a circle behind it, all in one SVG so the casing is seamless and the whole pin scales as a unit.
const PIN_PATH =
  'M11 2 H23 Q32 2 32 11 V21 Q32 30 23 30 H21 L17 42 L13 30 H11 Q2 30 2 21 V11 Q2 2 11 2 Z';

// Graduated-size modifier for the pin (a pre-attentive, colour-independent severity channel). Whole
// literals per level so the global CSS never sees a composed class; unknown/absent → level 1.
function levelClass(level: number | undefined): string {
  if (level === LEVEL_THREE) {
    return 'fire-marker--lvl3';
  }
  if (level === LEVEL_TWO) {
    return 'fire-marker--lvl2';
  }
  return 'fire-marker--lvl1';
}

// Status glyph path per tone — authentic Material Symbols Outlined geometry (viewBox `0 -960 960 960`),
// the same icon set the app renders every <mat-icon> with, embedded as inline SVG. Inlining (rather than
// the icon font) keeps the marker free of any font dependency — no FOUT, crisp at any size — and immune
// to the unlayered `.material-symbols-outlined` font rule that would otherwise override a layered glyph
// size. The glyph is a colour-independent status signal (FIRE-AREA-6 / MAP-3): flame=going,
// perimeter=contained, shield=controlled, all-clear=safe, resolved=neutral, unknown=missing. Whole
// literals, mirroring MARKER_TONE_CLASS — never composed at runtime. Exported so the map legend can draw
// the very same glyph beside each status label (so the legend explains exactly what each symbol means).
export const GLYPH_TONE: Readonly<Record<StatusTone, string>> = {
  going:
    'M240-400q0 52 21 98.5t60 81.5q-1-5-1-9v-9q0-32 12-60t35-51l113-111 113 111q23 23 35 51t12 60v9q0 4-1 9 39-35 60-81.5t21-98.5q0-50-18.5-94.5T648-574q-20 13-42 19.5t-45 6.5q-62 0-107.5-41T401-690q-39 33-69 68.5t-50.5 72Q261-513 250.5-475T240-400Zm240 52-57 56q-11 11-17 25t-6 29q0 32 23.5 55t56.5 23q33 0 56.5-23t23.5-55q0-16-6-29.5T537-292l-57-56Zm0-492v132q0 34 23.5 57t57.5 23q18 0 33.5-7.5T622-658l18-22q74 42 117 117t43 163q0 134-93 227T480-80q-134 0-227-93t-93-227q0-129 86.5-245T480-840Z',
  contained:
    'M200-120q-33 0-56.5-23.5T120-200v-160h80v160h160v80H200Zm400 0v-80h160v-160h80v160q0 33-23.5 56.5T760-120H600ZM120-600v-160q0-33 23.5-56.5T200-840h160v80H200v160h-80Zm640 0v-160H600v-80h160q33 0 56.5 23.5T840-760v160h-80Z',
  controlled:
    'M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z',
  safe: 'm424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
  neutral:
    'M268-240 42-466l57-56 170 170 56 56-57 56Zm226 0L268-466l56-57 170 170 368-368 56 57-424 424Zm0-226-57-56 198-198 57 56-198 198Z',
  missing:
    'M513.5-254.5Q528-269 528-290t-14.5-35.5Q499-340 478-340t-35.5 14.5Q428-311 428-290t14.5 35.5Q457-240 478-240t35.5-14.5ZM442-394h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
};

// The whole, static className for a tag pin: base + tone + graduated level, plus the Major escalation
// marker and the beacon-pulse modifier when this point is in the (capped) loud set.
export function markerClassName(p: MapPoint, pulse: boolean): string {
  const parts = ['fire-marker', MARKER_TONE_CLASS[p.tone], levelClass(p.level)];
  if (p.major === true) {
    parts.push('fire-marker--major');
  }
  if (pulse) {
    parts.push('fire-marker--pulse');
  }
  return parts.join(' ');
}

// The divIcon inner HTML — a single SVG tag-pin: an optional beacon-pulse circle (behind, for the capped
// loud set), the pin shape (filled with the tone, surface-cased), and the status glyph nested in the head
// (viewBox `0 -960 960 960`, sized into the head box). All aria-hidden — the status/level text is carried
// by the marker's title/alt label and the region aria-label; the pin's tip is the exact coordinate.
export function markerHtml(p: MapPoint, pulse: boolean): string {
  const pulseEl = pulse
    ? '<circle class="fire-marker__pulse" cx="17" cy="16" r="13" aria-hidden="true" />'
    : '';
  return (
    '<svg class="fire-marker__pin" viewBox="0 0 34 42" aria-hidden="true">' +
    pulseEl +
    `<path class="fire-marker__pin-shape" d="${PIN_PATH}" />` +
    `<svg class="fire-marker__pin-glyph" x="9" y="8" width="16" height="16" viewBox="0 -960 960 960"><path d="${GLYPH_TONE[p.tone]}" /></svg>` +
    '</svg>'
  );
}

// Leaflet stacking offset so the most important fire wins an overlap: Major on top, else by level.
export function markerStackOffset(p: MapPoint): number {
  return p.major === true ? MAJOR_Z : (p.level ?? DEFAULT_LEVEL) * LEVEL_Z_STEP;
}

// The capped "loud" set that earns the animated beacon pulse: going OR major fires, ranked Major-first
// then by level, bounded to PULSE_CAP so the overview never animates hundreds of markers. Returned as a
// Set keyed on the point objects so drawing can ask membership in O(1).
export function pulseTargets(pts: readonly MapPoint[]): ReadonlySet<MapPoint> {
  const loud = pts.filter((p) => p.tone === 'going' || p.major === true);
  const ranked = [...loud].sort((a, b) => {
    const byMajor = Number(b.major ?? false) - Number(a.major ?? false);
    return byMajor !== 0 ? byMajor : (b.level ?? DEFAULT_LEVEL) - (a.level ?? DEFAULT_LEVEL);
  });
  return new Set(ranked.slice(0, PULSE_CAP));
}
