import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { StatusTone } from '@workspace/shared-domain';
import {
  control,
  circle as createCircle,
  map as createMap,
  divIcon,
  type LatLngTuple,
  type Layer,
  type Map as LeafletMap,
  latLng,
  latLngBounds,
  marker,
  type TileLayer,
  type TileLayerOptions,
  tileLayer,
} from 'leaflet';
import { ThemeService } from '../../../../core/theme.service';
import { MARKER_TONE_CLASS, type MapPoint, SPINE_TONE } from '../../../../shared/ui/tone-classes';

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MAX_ZOOM = 20;
const MARKER_ICON_PX = 24;
const MARKER_ANCHOR_PX = 12;
const FIT_BOUNDS_PAD_PX = 24;
const MARKER_ICON_SIZE: [number, number] = [MARKER_ICON_PX, MARKER_ICON_PX];
const MARKER_ICON_ANCHOR: [number, number] = [MARKER_ANCHOR_PX, MARKER_ANCHOR_PX];
const FIT_BOUNDS_PADDING: [number, number] = [FIT_BOUNDS_PAD_PX, FIT_BOUNDS_PAD_PX];
// Extent-circle styling: a toned outline over a translucent toned fill (the colour comes from the
// `.fire-circle--<tone>` class so it stays token-driven; opacity/weight are geometry, not colour).
const CIRCLE_FILL_OPACITY = 0.3;
const CIRCLE_STROKE_WEIGHT = 2;
// Square metres per hectare — converts `fireAreaHectares` to the circle radius in metres.
const SQM_PER_HECTARE = 10_000;
// SVG-fallback projection: an 8-unit inset inside a 100-unit viewBox leaves an 84-unit plotting span.
const SVG_PAD = 8;
const SVG_SPAN = 84;
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
  // Whole-literal swatch class (from SPINE_TONE) so Tailwind keeps the utility — never composed at runtime.
  swatch: string;
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

// Colour-independent label for a marker/legend/fallback: "{name} — {status} — {area} ha".
function pointLabel(p: MapPoint): string {
  const status = p.status ? ` — ${p.status}` : '';
  const area = p.areaHa && p.areaHa > 0 ? ` — ${p.areaHa.toLocaleString()} ha` : '';
  return `${p.name}${status}${area}`;
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
              @if (p.r > 0) { <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.r" [attr.class]="'map-area ' + p.spine"></circle> }
              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.5" [attr.class]="'map-dot ' + p.spine"></circle>
            }
          </svg>
          <p class="incident-map__note">Map tiles unavailable — showing plotted coordinates.</p>
          <ul class="incident-map__fallback-list" data-testid="map-fallback-list">
            @for (p of points(); track $index) {
              <li>{{ p.name }}@if (p.status) { — {{ p.status }} }@if (p.areaHa) { — {{ p.areaHa.toLocaleString() }} ha } <span class="font-mono tabular-nums">({{ p.lat.toFixed(coordDp) }}, {{ p.lng.toFixed(coordDp) }})</span></li>
            }
          </ul>
        } @else {
          <div #mapEl tabindex="0" class="incident-map__canvas" [attr.aria-label]="ariaLabel()"></div>
        }
        <div class="incident-map__legend" data-testid="map-legend" role="group" aria-label="Map symbology">
          <ul class="incident-map__legend-tones">
            @for (entry of legend(); track entry.tone) {
              <li class="incident-map__legend-item">
                <span class="incident-map__swatch" [class]="entry.swatch" aria-hidden="true"></span>
                <span>{{ entry.label }}</span>
              </li>
            }
          </ul>
          <p class="incident-map__legend-shapes">Filled area = fire extent (area-sized) · Pin = point only</p>
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
      <div class="incident-map__empty" data-testid="map-empty">
        <mat-icon aria-hidden="true">map</mat-icon>
        <p>No coordinates recorded.</p>
        @if (locationDescription()) { <p class="text-on-surface-variant">{{ locationDescription() }}</p> }
      </div>
    }
  `,
  styles: [
    `
    :host { display: block; }
    .incident-map__canvas, .incident-map__svg { display: block; width: 100%; height: 14rem; border-radius: var(--app-radius-card); border: 1px solid var(--mat-sys-outline); }
    .incident-map__canvas { outline: none; }
    .incident-map__canvas:focus-visible { outline: 3px solid var(--mat-sys-secondary); outline-offset: 3px; }
    .incident-map__svg { background: var(--mat-sys-surface-container-low); }
    .map-dot.bg-status-going { fill: var(--color-status-going); } .map-dot.bg-status-contained { fill: var(--color-status-contained); }
    .map-dot.bg-status-controlled { fill: var(--color-status-controlled); } .map-dot.bg-status-safe { fill: var(--color-status-safe); }
    .map-dot.bg-status-neutral { fill: var(--color-status-neutral); } .map-dot.bg-status-missing { fill: var(--color-status-missing); }
    .map-area { fill-opacity: 0.3; stroke-width: 1; }
    .map-area.bg-status-going { fill: var(--color-status-going); stroke: var(--color-status-going); } .map-area.bg-status-contained { fill: var(--color-status-contained); stroke: var(--color-status-contained); }
    .map-area.bg-status-controlled { fill: var(--color-status-controlled); stroke: var(--color-status-controlled); } .map-area.bg-status-safe { fill: var(--color-status-safe); stroke: var(--color-status-safe); }
    .map-area.bg-status-neutral { fill: var(--color-status-neutral); stroke: var(--color-status-neutral); } .map-area.bg-status-missing { fill: var(--color-status-missing); stroke: var(--color-status-missing); }
    .incident-map__note { margin: .5rem 0 0; font-size: .8125rem; color: var(--mat-sys-on-surface-variant); }
    .incident-map__fallback-list { margin: .375rem 0 0; padding-left: 1.1rem; font-size: .8125rem; color: var(--mat-sys-on-surface-variant); }
    .incident-map__fallback-list li { padding: .0625rem 0; }
    .incident-map__legend { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem 1rem; margin: .625rem 0 0; }
    .incident-map__legend-tones { display: flex; flex-wrap: wrap; gap: .25rem 1rem; margin: 0; padding: 0; list-style: none; }
    .incident-map__legend-item { display: inline-flex; align-items: center; gap: .375rem; font-size: .8125rem; color: var(--mat-sys-on-surface); }
    .incident-map__swatch { width: .75rem; height: .75rem; border-radius: 3px; border: 1px solid var(--mat-sys-outline); flex: none; }
    .incident-map__legend-shapes { flex-basis: 100%; margin: 0; font-size: .75rem; color: var(--mat-sys-on-surface-variant); }
    .incident-map__coords { display: grid; grid-template-columns: auto 1fr; gap: .125rem 1rem; margin: .75rem 0 0; font-size: .8125rem; }
    .incident-map__coords dt { color: var(--mat-sys-on-surface-variant); }
    .incident-map__empty { display: grid; place-items: center; gap: .25rem; height: 14rem; border-radius: var(--app-radius-card); border: 1px dashed var(--mat-sys-outline); color: var(--mat-sys-on-surface-variant); }
  `,
  ],
})
export class IncidentMapComponent {
  readonly points = input.required<readonly MapPoint[]>();
  readonly locationDescription = input('');
  readonly singleZoom = input(DEFAULT_SINGLE_ZOOM);
  protected readonly coordDp = COORD_DP;
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('mapEl');
  protected readonly tilesFailed = signal(false);
  protected readonly hasPoints = computed(() => this.points().length > 0);
  protected readonly single = computed<MapPoint | null>(() =>
    this.points().length === 1 ? (this.points()[0] ?? null) : null,
  );
  // Legend keys only the tones actually present, in a stable severity order.
  protected readonly legend = computed<LegendEntry[]>(() => {
    const present = new Set(this.points().map((p) => p.tone));
    return TONE_ORDER.filter((tone) => present.has(tone)).map((tone) => ({
      tone,
      label: TONE_LABEL[tone],
      swatch: SPINE_TONE[tone],
    }));
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
  protected readonly projected = computed(() => {
    const pts = this.points();
    const latitudes = pts.map((p) => p.lat);
    const longitudes = pts.map((p) => p.lng);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const sx = maxLng - minLng || 1;
    const sy = maxLat - minLat || 1;
    return pts.map((p) => ({
      x: SVG_PAD + ((p.lng - minLng) / sx) * SVG_SPAN,
      y: SVG_PAD + ((maxLat - p.lat) / sy) * SVG_SPAN,
      r: fallbackRingRadius(p.areaHa),
      // SPINE_TONE yields the `bg-status-<tone>` selector hook the component's SVG-fill rules match.
      spine: SPINE_TONE[p.tone],
    }));
  });
  private map: LeafletMap | null = null;
  private layer: TileLayer | null = null;
  private readonly isDark = computed(() => {
    const m = this.theme.theme();
    return (
      m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  constructor() {
    afterNextRender({ write: () => this.initMap() });
    effect(() => {
      const dark = this.isDark();
      const map = this.map;
      if (!map) {
        return;
      }
      this.layer?.remove();
      this.layer = this.addTileLayer(map, dark);
    });
    this.destroyRef.onDestroy(() => {
      this.map?.remove();
      this.map = null;
      this.layer = null;
    });
  }

  // Build the Leaflet map once the canvas exists: base tiles, metric scale, per-fire extent/pin geometry,
  // then frame the view. A no-op when there is no canvas (empty/fallback states) or no points.
  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    const pts = this.points();
    const first = pts[0];
    if (!(el && first)) {
      return;
    }
    const leafletMap = createMap(el, { attributionControl: true, keyboard: true });
    this.map = leafletMap;
    this.layer = this.addTileLayer(leafletMap, this.isDark());
    // Metric-only scale bar so distances on the map are legible (MAP-1).
    control.scale({ imperial: false }).addTo(leafletMap);
    for (const p of pts) {
      this.drawPoint(leafletMap, p);
    }
    this.frame(leafletMap, pts, first);
    leafletMap.invalidateSize();
  }

  private addTileLayer(map: LeafletMap, dark: boolean): TileLayer {
    const layer = tileLayer(dark ? DARK_TILES : LIGHT_TILES, TILE_OPTS);
    layer.on('tileerror', () => this.tilesFailed.set(true));
    layer.addTo(map);
    return layer;
  }

  // An area-sized extent circle for fires with area (FIRE-AREA-4), plus the centroid pin; a plain pin when
  // area is absent/0. Marker title/alt carry name+status+area so colour is never the sole signal (MAP-3).
  private drawPoint(map: LeafletMap, p: MapPoint): Layer[] {
    const center: LatLngTuple = [p.lat, p.lng];
    const layers: Layer[] = [];
    if (p.areaHa && p.areaHa > 0) {
      const extent = createCircle(center, {
        radius: areaRadiusMetres(p.areaHa),
        className: CIRCLE_TONE_CLASS[p.tone],
        fillOpacity: CIRCLE_FILL_OPACITY,
        weight: CIRCLE_STROKE_WEIGHT,
        interactive: false,
      });
      extent.addTo(map);
      layers.push(extent);
    }
    const label = pointLabel(p);
    const pin = marker(center, {
      icon: divIcon({
        className: `fire-marker ${MARKER_TONE_CLASS[p.tone]}`,
        html: '<span class="fire-marker__dot"></span>',
        iconSize: MARKER_ICON_SIZE,
        iconAnchor: MARKER_ICON_ANCHOR,
      }),
      keyboard: true,
      title: label,
      alt: label,
    });
    pin.addTo(map);
    layers.push(pin);
    return layers;
  }

  // Frame the drawn geometry. A lone pin with no area uses the suburb-scale zoom; anything with an extent
  // (or multiple points) fits the union of all bounds, so a 50,000 ha fire fills the view. Reduced-motion
  // users skip the framing animation (MAP-6).
  private frame(map: LeafletMap, pts: readonly MapPoint[], first: MapPoint): void {
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onlyPin = pts.length === 1 && !(first.areaHa && first.areaHa > 0);
    if (onlyPin) {
      map.setView([first.lat, first.lng], this.singleZoom(), { animate });
      return;
    }
    // Derive the fit bounds from the DATA, not layer.getBounds() — an L.circle only has a projected
    // extent once the map has a view, so getBounds() throws during init. Each point contributes its
    // centre; area fires expand to their extent circle's bounds via latLng().toBounds(diameterMetres).
    const bounds = latLngBounds(pts.map((p) => [p.lat, p.lng] as LatLngTuple));
    for (const p of pts) {
      if (p.areaHa && p.areaHa > 0) {
        bounds.extend(latLng(p.lat, p.lng).toBounds(2 * areaRadiusMetres(p.areaHa)));
      }
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, animate });
    }
  }
}
