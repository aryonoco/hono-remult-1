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
import {
  map as createMap,
  divIcon,
  type LatLngTuple,
  type Map as LeafletMap,
  latLngBounds,
  marker,
  type TileLayer,
  type TileLayerOptions,
  tileLayer,
} from 'leaflet';
import { ThemeService } from '../../../../core/theme.service';
import { MARKER_TONE_CLASS, type MapPoint } from '../../../../shared/ui/tone-classes';

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MAX_ZOOM = 20;
const MARKER_ICON_PX = 24;
const MARKER_ANCHOR_PX = 12;
const FIT_BOUNDS_PAD_PX = 24;
const MARKER_ICON_SIZE: [number, number] = [MARKER_ICON_PX, MARKER_ICON_PX];
const MARKER_ICON_ANCHOR: [number, number] = [MARKER_ANCHOR_PX, MARKER_ANCHOR_PX];
const FIT_BOUNDS_PADDING: [number, number] = [FIT_BOUNDS_PAD_PX, FIT_BOUNDS_PAD_PX];
// SVG-fallback projection: an 8-unit inset inside a 100-unit viewBox leaves an 84-unit plotting span.
const SVG_PAD = 8;
const SVG_SPAN = 84;
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

@Component({
  selector: 'app-incident-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (hasPoints()) {
      <div class="incident-map" role="region" [attr.aria-label]="ariaLabel()">
        @if (tilesFailed()) {
          <svg class="incident-map__svg" data-testid="map-svg-fallback" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            @for (p of projected(); track $index) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.5" [attr.class]="'map-dot ' + p.spine"></circle> }
          </svg>
          <p class="incident-map__note">Map tiles unavailable — showing plotted coordinates.</p>
        } @else {
          <div #mapEl tabindex="0" class="incident-map__canvas" [attr.aria-label]="ariaLabel()"></div>
        }
        @if (single(); as s) {
          <dl class="incident-map__coords">
            <dt>Latitude</dt><dd class="font-mono tabular-nums">{{ s.lat }}</dd>
            <dt>Longitude</dt><dd class="font-mono tabular-nums">{{ s.lng }}</dd>
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
    .incident-map__canvas, .incident-map__svg { display: block; width: 100%; height: 14rem; border-radius: var(--radius-card); border: 1px solid var(--mat-sys-outline-variant); }
    .incident-map__canvas:focus-visible { outline: 2px solid var(--mat-sys-primary); outline-offset: 2px; }
    .incident-map__svg { background: var(--mat-sys-surface-container-low); }
    .map-dot.bg-status-going { fill: var(--color-status-going); } .map-dot.bg-status-contained { fill: var(--color-status-contained); }
    .map-dot.bg-status-controlled { fill: var(--color-status-controlled); } .map-dot.bg-status-safe { fill: var(--color-status-safe); }
    .map-dot.bg-status-neutral { fill: var(--color-status-neutral); } .map-dot.bg-status-missing { fill: var(--color-status-missing); }
    .incident-map__note { margin: .5rem 0 0; font-size: .8125rem; color: var(--mat-sys-on-surface-variant); }
    .incident-map__coords { display: grid; grid-template-columns: auto 1fr; gap: .125rem 1rem; margin: .75rem 0 0; font-size: .8125rem; }
    .incident-map__coords dt { color: var(--mat-sys-on-surface-variant); }
    .incident-map__empty { display: grid; place-items: center; gap: .25rem; height: 14rem; border-radius: var(--radius-card); border: 1px dashed var(--mat-sys-outline-variant); color: var(--mat-sys-on-surface-variant); }
  `,
  ],
})
export class IncidentMapComponent {
  readonly points = input.required<readonly MapPoint[]>();
  readonly locationDescription = input('');
  readonly singleZoom = input(DEFAULT_SINGLE_ZOOM);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('mapEl');
  protected readonly tilesFailed = signal(false);
  protected readonly hasPoints = computed(() => this.points().length > 0);
  protected readonly single = computed<MapPoint | null>(() =>
    this.points().length === 1 ? (this.points()[0] ?? null) : null,
  );
  protected readonly ariaLabel = computed(() => {
    const pts = this.points();
    const first = pts[0];
    return pts.length === 1 && first
      ? `Location of ${first.name}`
      : `Map of ${pts.length} active incidents`;
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
      spine: `bg-status-${p.tone}`,
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
    afterNextRender({
      write: () => {
        const el = this.mapEl()?.nativeElement;
        const pts = this.points();
        const first = pts[0];
        if (!(el && first)) {
          return;
        }
        const leafletMap = createMap(el, { attributionControl: true, keyboard: true });
        this.map = leafletMap;
        this.layer = tileLayer(this.isDark() ? DARK_TILES : LIGHT_TILES, TILE_OPTS);
        this.layer.on('tileerror', () => this.tilesFailed.set(true));
        this.layer.addTo(leafletMap);
        for (const p of pts) {
          marker([p.lat, p.lng], {
            icon: divIcon({
              className: `fire-marker ${MARKER_TONE_CLASS[p.tone]}`,
              html: '<span class="fire-marker__dot"></span>',
              iconSize: MARKER_ICON_SIZE,
              iconAnchor: MARKER_ICON_ANCHOR,
            }),
            keyboard: true,
            title: p.name,
            alt: p.name,
          }).addTo(leafletMap);
        }
        if (pts.length === 1) {
          leafletMap.setView([first.lat, first.lng], this.singleZoom());
        } else {
          const b = latLngBounds(pts.map((p) => [p.lat, p.lng] as LatLngTuple));
          if (b.isValid()) {
            leafletMap.fitBounds(b, { padding: FIT_BOUNDS_PADDING });
          }
        }
        leafletMap.invalidateSize();
      },
    });
    effect(() => {
      const dark = this.isDark();
      const map = this.map;
      if (!map) {
        return;
      }
      this.layer?.remove();
      this.layer = tileLayer(dark ? DARK_TILES : LIGHT_TILES, TILE_OPTS);
      this.layer.on('tileerror', () => this.tilesFailed.set(true));
      this.layer.addTo(map);
    });
    this.destroyRef.onDestroy(() => {
      this.map?.remove();
      this.map = null;
      this.layer = null;
    });
  }
}
