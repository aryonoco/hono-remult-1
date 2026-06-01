import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import type { FirePerimeter, StatusTone } from '@workspace/shared-domain';
import {
  control,
  circle as createCircle,
  map as createMap,
  divIcon,
  geoJSON,
  type LatLngBounds,
  type LatLngTuple,
  type LayerGroup,
  type Map as LeafletMap,
  latLng,
  latLngBounds,
  layerGroup,
  type Marker,
  marker,
  type TileLayer,
  type TileLayerOptions,
  tileLayer,
} from 'leaflet';
import { ThemeService } from '../../../../core/theme.service';
import {
  MARKER_TONE_CLASS,
  type MapPoint,
  POLYGON_TONE_CLASS,
  SPINE_TONE,
} from '../../../../shared/ui/tone-classes';
import {
  GLYPH_TONE,
  markerClassName,
  markerHtml,
  markerStackOffset,
  pulseTargets,
} from './marker-symbology';

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MAX_ZOOM = 20;
// "Planted pin" marker geometry. The marker is one cohesive SVG tag-pin — a rounded glyph head tapering
// to a pointer whose tip sits exactly on the coordinate — so there is no gap or detached dot: the symbol
// points at its own location. The pin is bottom-anchored in a fixed box (it scales by incident level via
// a modifier class, growing upward from the tip), so the anchor is one value: the bottom centre, where
// the pin's tip lands. The box is tall enough for the largest (level-3) pin.
const MARKER_BOX_W = 40;
const MARKER_BOX_H = 48;
const MARKER_BOX_SIZE: [number, number] = [MARKER_BOX_W, MARKER_BOX_H];
const MARKER_BOX_ANCHOR: [number, number] = [MARKER_BOX_W / 2, MARKER_BOX_H];
const FIT_BOUNDS_PAD_PX = 24;
const FIT_BOUNDS_PADDING: [number, number] = [FIT_BOUNDS_PAD_PX, FIT_BOUNDS_PAD_PX];
// Extent-circle styling: a toned outline over a translucent toned fill (the colour comes from the
// `.fire-circle--<tone>` class so it stays token-driven; opacity/weight are geometry, not colour).
const CIRCLE_FILL_OPACITY = 0.3;
const CIRCLE_STROKE_WEIGHT = 2;
// Extent-polygon styling mirrors the circle (translucent toned fill + toned outline from
// `.fire-polygon--<tone>`); opacity/weight are geometry, not colour, so they stay inline.
const POLYGON_FILL_OPACITY = 0.3;
const POLYGON_STROKE_WEIGHT = 2;
// Square metres per hectare — converts `fireAreaHectares` to the circle radius in metres.
const SQM_PER_HECTARE = 10_000;
// SVG-fallback projection: an 8-unit inset inside a 100-unit viewBox leaves an 84-unit plotting span.
const SVG_PAD = 8;
const SVG_SPAN = 84;
// Decimal places for a projected viewBox coordinate — two is sub-pixel at this 100-unit scale and keeps
// the emitted `points` string compact.
const SVG_COORD_DP = 2;
// SVG-fallback extent ring: a coarse log-scaled radius (base unit + log10(ha) gain), capped to a fraction
// of the span so a large fire still reads bigger than a small one without a metres-to-viewBox projection.
const SVG_AREA_RING_BASE = 1.5;
const SVG_AREA_RING_GAIN = 3;
const SVG_AREA_RING_SPAN_DIVISOR = 4;
const SVG_AREA_RING_MAX: number = SVG_SPAN / SVG_AREA_RING_SPAN_DIVISOR;
// Coordinate precision for the colour-independent SVG-fallback list (MAP-3).
const COORD_DP = 3;
// Default Leaflet zoom for a single-incident view (suburb/town scale).
const DEFAULT_SINGLE_ZOOM = 11;
// Cap how far fitBounds may zoom in (MAP-9). Without it a small fire frames to its own ~100 m extent box
// at building level, which is geographically meaningless; capping keeps town/region context in view while
// the extent stays a clear, distinct shape. Large fires fit below this zoom, so the cap never affects them.
const FIT_MAX_ZOOM = 13;
// The standard public CARTO/OpenStreetMap basemap attribution required by the tile licence.
const ATTRIBUTION =
  // biome-ignore lint/security/noSecrets: public attribution links, not a secret
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const TILE_OPTS: TileLayerOptions = {
  subdomains: 'abcd',
  maxZoom: MAX_ZOOM,
  attribution: ATTRIBUTION,
};

// Human-readable tone names for the legend. The six operational tones (going=love, contained=gold,
// controlled=foam, safe=pine, neutral=subtle, missing=iris) collapse the nine statuses; the legend
// keys the colour so it is never the sole signal (MAP-1 / MAP-3).
const TONE_LABEL: Readonly<Record<StatusTone, string>> = {
  going: 'Going',
  contained: 'Contained',
  controlled: 'Controlled',
  safe: 'Safe',
  neutral: 'Resolved',
  missing: 'Not found',
};
const TONE_ORDER: readonly StatusTone[] = [
  'going',
  'contained',
  'controlled',
  'safe',
  'neutral',
  'missing',
];
// Status-toned extent-circle classes (whole literals, mirroring SPINE_TONE — Leaflet applies the
// className to the rendered SVG `<path>`, which the component styles fill/stroke with status tokens).
const CIRCLE_TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  going: 'fire-circle--going',
  contained: 'fire-circle--contained',
  controlled: 'fire-circle--controlled',
  safe: 'fire-circle--safe',
  neutral: 'fire-circle--neutral',
  missing: 'fire-circle--missing',
};

interface LegendEntry {
  tone: StatusTone;
  label: string;
  // The status glyph path (Material Symbols geometry) so the legend draws the very symbol used on the
  // map's pins — the legend then says exactly what each marker means, not just its colour.
  glyph: string;
  // The whole-literal global tone class (`fire-marker--<tone>`) that colours the legend chip.
  toneClass: string;
}

// Radius in metres of a circle whose area equals `areaHa` hectares (r = √(area / π)). A 50,000 ha fire
// yields ~12.6 km; a 0.1 ha fire ~18 m — so the extent visibly scales with the burnt area.
function areaRadiusMetres(areaHa: number): number {
  return Math.sqrt((areaHa * SQM_PER_HECTARE) / Math.PI);
}

// Unit-free SVG-fallback ring radius: 0 when no area, else a capped log-scaled hint of the extent.
function fallbackRingRadius(areaHa: number | undefined): number {
  if (!(areaHa && areaHa > 0)) {
    return 0;
  }
  return Math.min(
    SVG_AREA_RING_MAX,
    SVG_AREA_RING_BASE + Math.log10(areaHa + 1) * SVG_AREA_RING_GAIN,
  );
}

// How a fire's extent is depicted on the map, in fidelity order: a true mapped polygon, an
// area-sized estimate circle, or a bare point. Drives the render fallback chain (FIRE-AREA-5) and the
// colour-independent text equivalent so the geometry kind is never the sole signal (FIRE-AREA-6).
type ExtentKind = 'polygon' | 'circle' | 'pin';
const EXTENT_KIND_LABEL: Readonly<Record<ExtentKind, string>> = {
  polygon: 'mapped extent',
  circle: 'area estimate',
  pin: 'point only',
};

function hasArea(areaHa: number | undefined): areaHa is number {
  return areaHa !== undefined && areaHa > 0;
}

function extentKind(p: MapPoint): ExtentKind {
  if (p.perimeter) {
    return 'polygon';
  }
  return hasArea(p.areaHa) ? 'circle' : 'pin';
}

// Colour-independent label for a marker/legend/fallback:
// "{name} — {status} — {area} ha — {extent kind}". The trailing extent kind distinguishes a true
// mapped polygon from an area estimate or a bare point, so the geometry is conveyed in text (MAP-3 /
// FIRE-AREA-6).
function pointLabel(p: MapPoint): string {
  const status = p.status ? ` — ${p.status}` : '';
  const level = p.level ? ` — Level ${p.level}` : '';
  const major = p.major ? ' — Major' : '';
  const area = hasArea(p.areaHa) ? ` — ${p.areaHa.toLocaleString()} ha` : '';
  const extent = ` — ${EXTENT_KIND_LABEL[extentKind(p)]}`;
  return `${p.name}${status}${level}${major}${area}${extent}`;
}

// One SVG-fallback row: the projected centroid (x/y), the projected outer-ring `points` string for a
// mapped extent (empty otherwise), the area-ring radius for an estimate fire (0 for a polygon/pin), and
// the tone selector hook. The SVG is `aria-hidden`; the text equivalent lives in the fallback list.
interface ProjectedPoint {
  x: number;
  y: number;
  polygon: string;
  r: number;
  spine: string;
}

// The outer-ring latitudes/longitudes of a perimeter, used to widen the SVG-fallback projection bounds
// so a polygon never overflows the viewBox. GeoJSON positions are [lng, lat].
function perimeterLatitudes(perimeter: FirePerimeter | undefined): number[] {
  return (perimeter?.coordinates[0] ?? []).map(([, lat]) => lat);
}
function perimeterLongitudes(perimeter: FirePerimeter | undefined): number[] {
  return (perimeter?.coordinates[0] ?? []).map(([lng]) => lng);
}

// Project a perimeter's outer ring into the SVG viewBox as an `<polygon points="…">` string. GeoJSON
// positions are [lng, lat]; the closing repeat is harmless for an SVG polygon, so the whole ring maps.
function projectRing(
  perimeter: FirePerimeter,
  toX: (lng: number) => number,
  toY: (lat: number) => number,
): string {
  return (perimeter.coordinates[0] ?? [])
    .map(([lng, lat]) => `${toX(lng).toFixed(SVG_COORD_DP)},${toY(lat).toFixed(SVG_COORD_DP)}`)
    .join(' ');
}

@Component({
  selector: 'app-incident-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (hasPoints()) {
      <div class="incident-map" role="region" [attr.aria-label]="ariaLabel()">
        @if (tilesFailed()) {
          <svg class="incident-map__svg" data-testid="map-svg-fallback" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            @for (p of projected(); track $index) {
              @if (p.polygon) {
                <polygon [attr.points]="p.polygon" [attr.class]="'map-extent ' + p.spine"></polygon>
              } @else if (p.r > 0) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.r" [attr.class]="'map-area ' + p.spine"></circle>
              }
              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.5" [attr.class]="'map-dot ' + p.spine"></circle>
            }
          </svg>
          <p class="incident-map__note">Map tiles unavailable — showing plotted coordinates.</p>
          <ul class="incident-map__fallback-list" data-testid="map-fallback-list">
            @for (p of points(); track p.id ?? $index) {
              <li>{{ p.name }}@if (p.status) { — {{ p.status }} }@if (p.level) { — Level {{ p.level }} }@if (p.major) { — Major }@if (p.areaHa) { — {{ p.areaHa.toLocaleString() }} ha } — {{ extentLabel(p) }} <span class="font-mono tabular-nums">({{ p.lat.toFixed(coordDp) }}, {{ p.lng.toFixed(coordDp) }})</span></li>
            }
          </ul>
        } @else {
          <div #mapEl tabindex="0" class="incident-map__canvas" [attr.aria-label]="ariaLabel()"></div>
        }
        <div class="incident-map__legend" data-testid="map-legend" role="group" aria-label="Map symbology">
          <ul class="incident-map__legend-tones">
            @for (entry of legend(); track entry.tone) {
              <li class="incident-map__legend-item">
                <span class="incident-map__legend-symbol" [class]="entry.toneClass" aria-hidden="true">
                  <svg viewBox="0 -960 960 960"><path [attr.d]="entry.glyph"></path></svg>
                </span>
                <span>{{ entry.label }}</span>
              </li>
            }
          </ul>
          @if (channelKey(); as channels) {
            <p class="incident-map__legend-shapes" data-testid="map-legend-channels">{{ channels }}</p>
          }
        </div>
        @if (single(); as s) {
          <dl class="incident-map__coords">
            <dt>Latitude</dt><dd class="font-mono tabular-nums">{{ s.lat }}</dd>
            <dt>Longitude</dt><dd class="font-mono tabular-nums">{{ s.lng }}</dd>
            @if (s.areaHa) { <dt>Extent</dt><dd class="font-mono tabular-nums">{{ s.areaHa.toLocaleString() }} ha</dd> }
          </dl>
        }
      </div>
    } @else {
      <div class="incident-map__empty" data-testid="map-empty" role="status">
        <mat-icon class="incident-map__empty-icon" aria-hidden="true">location_off</mat-icon>
        <p class="incident-map__empty-text">No coordinates recorded.</p>
        @if (locationDescription(); as description) {
          <p class="incident-map__empty-sub">{{ description }}</p>
        }
      </div>
    }
  `,
  styles: [
    `
    :host { display: block; }
    .incident-map__canvas, .incident-map__svg { display: block; width: 100%; height: 14rem; border-radius: var(--app-radius-card); border: 1px solid var(--mat-sys-outline); }
    .incident-map__canvas { outline: none; }
    .incident-map__canvas:focus-visible { outline: 0.1875rem solid var(--mat-sys-secondary); outline-offset: 0.1875rem; }
    .incident-map__svg { background: var(--mat-sys-surface-container-low); }
    .map-dot.bg-status-going { fill: var(--color-status-going); } .map-dot.bg-status-contained { fill: var(--color-status-contained); }
    .map-dot.bg-status-controlled { fill: var(--color-status-controlled); } .map-dot.bg-status-safe { fill: var(--color-status-safe); }
    .map-dot.bg-status-neutral { fill: var(--color-status-neutral); } .map-dot.bg-status-missing { fill: var(--color-status-missing); }
    .map-area, .map-extent { fill-opacity: 0.3; stroke-width: 1; }
    .map-area.bg-status-going, .map-extent.bg-status-going { fill: var(--color-status-going); stroke: var(--color-status-going); } .map-area.bg-status-contained, .map-extent.bg-status-contained { fill: var(--color-status-contained); stroke: var(--color-status-contained); }
    .map-area.bg-status-controlled, .map-extent.bg-status-controlled { fill: var(--color-status-controlled); stroke: var(--color-status-controlled); } .map-area.bg-status-safe, .map-extent.bg-status-safe { fill: var(--color-status-safe); stroke: var(--color-status-safe); }
    .map-area.bg-status-neutral, .map-extent.bg-status-neutral { fill: var(--color-status-neutral); stroke: var(--color-status-neutral); } .map-area.bg-status-missing, .map-extent.bg-status-missing { fill: var(--color-status-missing); stroke: var(--color-status-missing); }
    .incident-map__note { margin-block: .5rem 0; font-size: .8125rem; color: var(--mat-sys-on-surface-variant); }
    .incident-map__fallback-list { margin-block: .375rem 0; padding-inline-start: 1.1rem; font-size: .8125rem; color: var(--mat-sys-on-surface-variant); }
    .incident-map__fallback-list li { padding-block: .0625rem; }
    .incident-map__legend { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem 1rem; margin-block: .625rem 0; }
    .incident-map__legend-tones { display: flex; flex-wrap: wrap; gap: .25rem 1rem; margin: 0; padding: 0; list-style: none; }
    .incident-map__legend-item { display: inline-flex; align-items: center; gap: .375rem; font-size: .8125rem; color: var(--mat-sys-on-surface); }
    /* The legend chip mirrors the map pin's head: a tone-filled square (color comes from the global
       .fire-marker--<tone> class) carrying the same status glyph in the surface token. */
    .incident-map__legend-symbol { display: inline-grid; place-items: center; inline-size: 1.25rem; block-size: 1.25rem; border-radius: .3125rem; background: currentColor; flex: none; }
    .incident-map__legend-symbol svg { inline-size: .8125rem; block-size: .8125rem; fill: var(--mat-sys-surface); }
    .incident-map__legend-shapes { flex-basis: 100%; margin: 0; font-size: .75rem; color: var(--mat-sys-on-surface-variant); }
    .incident-map__coords { display: grid; grid-template-columns: auto 1fr; gap: .125rem 1rem; margin-block: .75rem 0; font-size: .8125rem; }
    .incident-map__coords dt { color: var(--mat-sys-on-surface-variant); }
    /* Map empty state (DETAIL-4): a polished status panel mirroring the detail page's .panel--empty —
       a centred dashed-hairline placeholder with a muted glyph and copy, announced as role="status". */
    .incident-map__empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5rem; height: 14rem; padding: 1.5rem; text-align: center; border-radius: var(--app-radius-card); border: 1px dashed var(--mat-sys-outline); background: var(--mat-sys-surface-container-low); color: var(--mat-sys-on-surface-variant); }
    .incident-map__empty-icon { width: 2rem; height: 2rem; font-size: 2rem; opacity: .7; }
    .incident-map__empty-text { margin: 0; font-weight: 500; color: var(--mat-sys-on-surface); }
    .incident-map__empty-sub { margin: 0; font-size: .8125rem; }
  `,
  ],
})
export class IncidentMapComponent {
  readonly points = input.required<readonly MapPoint[]>();
  readonly locationDescription = input('');
  readonly singleZoom = input(DEFAULT_SINGLE_ZOOM);
  // Whether a marker links to its incident's detail page. True on the overview (navigate to the fire);
  // false on the detail page itself, where the lone marker would otherwise be a no-op self-link.
  readonly linkable = input(true);
  protected readonly coordDp = COORD_DP;
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('mapEl');
  protected readonly tilesFailed = signal(false);
  protected readonly hasPoints = computed(() => this.points().length > 0);
  protected readonly single = computed<MapPoint | null>(() =>
    this.points().length === 1 ? (this.points()[0] ?? null) : null,
  );
  // Legend keys only the tones actually present, in a stable severity order. Each entry carries the glyph
  // and tone class so the legend renders the very pin symbol next to its label.
  protected readonly legend = computed<LegendEntry[]>(() => {
    const present = new Set(this.points().map((p) => p.tone));
    return TONE_ORDER.filter((tone) => present.has(tone)).map((tone) => ({
      tone,
      label: TONE_LABEL[tone],
      glyph: GLYPH_TONE[tone],
      toneClass: MARKER_TONE_CLASS[tone],
    }));
  });
  // Explains the two extra non-colour channels the pin uses — graduated size (incident level) and a
  // heavier casing (Major) — but only when those channels actually vary in the plotted set, so the legend
  // documents exactly the cues on screen and stays quiet otherwise.
  protected readonly channelKey = computed<string>(() => {
    const pts = this.points();
    const levels = new Set(pts.map((p) => p.level).filter((l): l is number => l != null));
    const hints: string[] = [];
    if (levels.size > 1) {
      hints.push('Bigger pin = higher level');
    }
    if (pts.some((p) => p.major === true)) {
      hints.push('Bold outline = Major');
    }
    return hints.join(' · ');
  });
  protected readonly ariaLabel = computed(() => {
    const pts = this.points();
    const first = pts[0];
    if (pts.length === 1 && first) {
      return `Map showing the location of ${pointLabel(first)}`;
    }
    const summary = pts.map((p) => pointLabel(p)).join('; ');
    return `Map of ${pts.length} active incidents: ${summary}`;
  });
  protected readonly projected = computed<ProjectedPoint[]>(() => {
    const pts = this.points();
    // Span the plot over every centroid AND every polygon vertex, so a projected extent ring never
    // overflows the viewBox. `||` guards a zero span (a lone point) so the projection never divides by 0.
    const latitudes = pts.flatMap((p) => [p.lat, ...perimeterLatitudes(p.perimeter)]);
    const longitudes = pts.flatMap((p) => [p.lng, ...perimeterLongitudes(p.perimeter)]);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const sx = maxLng - minLng || 1;
    const sy = maxLat - minLat || 1;
    const toX = (lng: number): number => SVG_PAD + ((lng - minLng) / sx) * SVG_SPAN;
    const toY = (lat: number): number => SVG_PAD + ((maxLat - lat) / sy) * SVG_SPAN;
    return pts.map((p) => ({
      x: toX(p.lng),
      y: toY(p.lat),
      // A mapped extent draws its true outline; otherwise an area fire draws a log-scaled ring hint.
      polygon: p.perimeter ? projectRing(p.perimeter, toX, toY) : '',
      r: p.perimeter ? 0 : fallbackRingRadius(p.areaHa),
      // SPINE_TONE yields the `bg-status-<tone>` selector hook the component's SVG-fill rules match.
      spine: SPINE_TONE[p.tone],
    }));
  });
  private map: LeafletMap | null = null;
  private layer: TileLayer | null = null;
  // All per-point vector layers live in one group so a live `points()` change rebuilds them by clearing
  // and redrawing; the view is framed only once so updates never yank the user's pan/zoom.
  private markersLayer: LayerGroup | null = null;
  private framed = false;
  // Native keydown listeners on link markers, torn down on every rebuild and on destroy.
  private readonly markerCleanups: Array<() => void> = [];
  private readonly isDark = computed(() => {
    const m = this.theme.theme();
    return (
      m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  // The fire's extent-kind phrase for the colour-independent SVG-fallback list (FIRE-AREA-6).
  protected extentLabel(p: MapPoint): string {
    return EXTENT_KIND_LABEL[extentKind(p)];
  }

  constructor() {
    // Create the Leaflet map when its canvas appears and tear it down when it leaves. The canvas lives
    // inside `@if (hasPoints())`, so it is added/removed as the active set gains/loses points; an effect on
    // the `mapEl()` viewChild covers the first mount AND every re-mount (a single afterNextRender would not
    // rebuild the map after the empty state). Only `mapEl()` is tracked — the rest runs untracked.
    effect(() => {
      const el = this.mapEl()?.nativeElement;
      untracked(() => {
        if (el && this.map?.getContainer() !== el) {
          this.createMap(el);
        } else if (!el && this.map) {
          this.teardownMap();
        }
      });
    });
    // Re-tile on theme change (a no-op until the map exists).
    effect(() => {
      const dark = this.isDark();
      const map = this.map;
      if (!map) {
        return;
      }
      this.layer?.remove();
      this.layer = this.addTileLayer(map, dark);
    });
    // Keep the live map in step with its data: rebuild the markers/extents whenever `points()` changes
    // (an escalation, a status flip, the active set changing, or the dev-user switching scope). The map's
    // creation does the first render; this guard makes pre-map runs no-ops.
    effect(() => {
      const pts = this.points();
      if (this.map && this.markersLayer) {
        this.renderPoints(pts);
      }
    });
    this.destroyRef.onDestroy(() => this.teardownMap());
  }

  // Build the Leaflet map on the given canvas: base tiles, a metric scale bar (MAP-1), a marker layer
  // group, then the first point render (untracked — the points effect owns every subsequent render).
  private createMap(el: HTMLElement): void {
    const leafletMap = createMap(el, { attributionControl: true, keyboard: true });
    this.map = leafletMap;
    this.layer = this.addTileLayer(leafletMap, this.isDark());
    control.scale({ imperial: false }).addTo(leafletMap);
    this.markersLayer = layerGroup().addTo(leafletMap);
    this.framed = false;
    untracked(() => this.renderPoints(this.points()));
    leafletMap.invalidateSize();
  }

  // Dispose the map and its markers — on destroy, and whenever the canvas leaves the DOM (the empty state),
  // so the next canvas gets a fresh map rather than a stale one bound to a detached element.
  private teardownMap(): void {
    this.clearMarkers();
    this.map?.remove();
    this.map = null;
    this.layer = null;
    this.markersLayer = null;
  }

  // Rebuild every per-point layer from the current `points()`: drop the previous markers (and their
  // listeners), then frame ONCE (the first non-empty render) before drawing so the SVG renderer has a
  // view — a view-less map throws in `_clipPoints` when a Path is added first. Subsequent live updates
  // skip framing so the user's pan/zoom is preserved.
  private renderPoints(pts: readonly MapPoint[]): void {
    const map = this.map;
    const group = this.markersLayer;
    if (!(map && group)) {
      return;
    }
    this.clearMarkers();
    const first = pts[0];
    if (!first) {
      return;
    }
    if (!this.framed) {
      this.frame(map, pts, first);
      this.framed = true;
    }
    // Reserve the animated beacon pulse for the capped, highest-priority "loud" set so the overview never
    // animates hundreds of markers at once; every other marker is a static pin.
    const pulseSet = pulseTargets(pts);
    for (const p of pts) {
      this.drawPoint(group, p, pulseSet);
    }
  }

  // Tear down the previous render: run each link marker's listener cleanup, then empty the layer group.
  private clearMarkers(): void {
    for (const cleanup of this.markerCleanups) {
      cleanup();
    }
    this.markerCleanups.length = 0;
    this.markersLayer?.clearLayers();
  }

  private addTileLayer(map: LeafletMap, dark: boolean): TileLayer {
    const layer = tileLayer(dark ? DARK_TILES : LIGHT_TILES, TILE_OPTS);
    layer.on('tileerror', () => this.tilesFailed.set(true));
    layer.addTo(map);
    return layer;
  }

  // Per-fire extent geometry in fidelity order — polygon → area-circle → none (FIRE-AREA-5) — plus the
  // always-present "tag pin" marker. A `perimeter` draws the true mapped extent; otherwise an `areaHa>0`
  // fire draws an area-estimate circle; otherwise the pin alone marks the point. Both fills are token-driven
  // via their `.fire-polygon--`/`.fire-circle--` class; opacity/weight are geometry. The marker is a
  // status-toned glyph pin (graduated by level, Major-cased, beacon-pulsed when loud) whose tip sits on the
  // exact coordinate; its `aria-label` carries name+status+level+area+extent kind so colour is never the
  // sole signal (MAP-3 / FIRE-AREA-6). Layers go into the shared group so a live update can clear them; the
  // pin is stacked above the extent path, rises on hover so the most important fire wins overlaps, and
  // (when linkable and the point carries an id) links to that incident's detail page.
  private drawPoint(group: LayerGroup, p: MapPoint, pulseSet: ReadonlySet<MapPoint>): void {
    const center: LatLngTuple = [p.lat, p.lng];
    if (p.perimeter) {
      geoJSON(p.perimeter, {
        // `className`/fill go in `style` (a PathOptions); Leaflet applies them to the rendered SVG path.
        style: {
          className: POLYGON_TONE_CLASS[p.tone],
          fillOpacity: POLYGON_FILL_OPACITY,
          weight: POLYGON_STROKE_WEIGHT,
        },
        interactive: false,
      }).addTo(group);
    } else if (hasArea(p.areaHa)) {
      createCircle(center, {
        radius: areaRadiusMetres(p.areaHa),
        className: CIRCLE_TONE_CLASS[p.tone],
        fillOpacity: CIRCLE_FILL_OPACITY,
        weight: CIRCLE_STROKE_WEIGHT,
        interactive: false,
      }).addTo(group);
    }
    const label = pointLabel(p);
    const pulse = pulseSet.has(p);
    const pin = marker(center, {
      icon: divIcon({
        className: markerClassName(p, pulse),
        html: markerHtml(p, pulse),
        iconSize: MARKER_BOX_SIZE,
        iconAnchor: MARKER_BOX_ANCHOR,
      }),
      keyboard: true,
      // `title` shows a hover tooltip; the accessible name is set as `aria-label` on the element below
      // (Leaflet's `alt` option only applies to <img> icons, not a divIcon's <div>).
      title: label,
      riseOnHover: true,
      zIndexOffset: markerStackOffset(p),
    });
    pin.addTo(group);
    const el = pin.getElement();
    el?.setAttribute('aria-label', label);
    if (this.linkable() && p.id) {
      this.makeNavigable(pin, p.id, el);
    }
  }

  // Make a marker a link to its incident: navigate on click and on Enter while focused. `role="link"` (in-app
  // navigation, not a button) over Leaflet's default; Space is intentionally NOT bound (link semantics —
  // Space scrolls). The native keydown listener is registered for cleanup so a live rebuild leaves none behind.
  private makeNavigable(pin: Marker, id: string, el: HTMLElement | undefined): void {
    const go = (): void => {
      this.router.navigate(['/incidents', id]).catch(() => {
        /* navigation errors are non-actionable here (e.g. a concurrent navigation) */
      });
    };
    pin.on('click', go);
    if (!el) {
      return;
    }
    el.setAttribute('role', 'link');
    const onKeydown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        go();
      }
    };
    el.addEventListener('keydown', onKeydown);
    this.markerCleanups.push(() => el.removeEventListener('keydown', onKeydown));
  }

  // Frame the drawn geometry. A lone bare pin (no polygon, no area) uses the suburb-scale zoom; anything
  // with an extent (polygon or circle) or multiple points fits the union of all bounds, so a mapped
  // fire fills the view. Reduced-motion users skip the framing animation (MAP-6).
  private frame(map: LeafletMap, pts: readonly MapPoint[], first: MapPoint): void {
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onlyPin = pts.length === 1 && !first.perimeter && !hasArea(first.areaHa);
    if (onlyPin) {
      map.setView([first.lat, first.lng], this.singleZoom(), { animate });
      return;
    }
    // Derive the fit bounds from the DATA, never layer.getBounds() — an L.circle / L.geoJSON only has a
    // projected extent once the map has a view, so getBounds() throws during init (the d3ac017 / MAP-9
    // crash). Each point contributes its centre; a polygon extends the bounds by each [lat, lng] vertex
    // (GeoJSON is [lng, lat]); an area fire expands to its circle's bounds via toBounds(diameterMetres).
    const bounds = latLngBounds(pts.map((p) => [p.lat, p.lng] as LatLngTuple));
    for (const p of pts) {
      if (p.perimeter) {
        this.extendWithPerimeter(bounds, p.perimeter);
      } else if (hasArea(p.areaHa)) {
        bounds.extend(latLng(p.lat, p.lng).toBounds(2 * areaRadiusMetres(p.areaHa)));
      }
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, animate, maxZoom: FIT_MAX_ZOOM });
    }
  }

  // Crash-safe polygon framing: extend `bounds` by each vertex of every ring directly from the GeoJSON
  // coordinates ([lng, lat]) — never via the geoJSON layer's getBounds(), which has no projected pixel
  // extent and throws before the map has a view (the prior map-crash fix).
  private extendWithPerimeter(bounds: LatLngBounds, perimeter: FirePerimeter): void {
    for (const ring of perimeter.coordinates) {
      for (const [lng, lat] of ring) {
        bounds.extend([lat, lng] as LatLngTuple);
      }
    }
  }
}
