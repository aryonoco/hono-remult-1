# Map setup

## Contents

- Install and import (v5, code-splitting, the CSS rule)
- The zoneless-Angular lifecycle (the canonical component shape)
- `MapOptions` worth knowing
- The neverthrow boundary
- Coordinate primitives (`LngLat`, `LngLatBounds`, `[lng, lat]`)
- Module-level engine config (`addProtocol`, RTL text, workers)

## Install and import

```bash
npm install maplibre-gl   # pin ^5 — v5.24.0 is current stable; ships its own .d.ts (no @types)
```

```ts
import { Map, NavigationControl, ScaleControl, AttributionControl } from 'maplibre-gl';
```

Two rules that bite:

- **Code-split the bundle.** MapLibre is ~270 KB minified. In a lazy feature route, `await import('maplibre-gl')`
  inside `afterNextRender` keeps it off the route's initial chunk.
- **The CSS must be global.** `import 'maplibre-gl/dist/maplibre-gl.css'` belongs in a global stylesheet
  (`styles.scss` or `angular.json` `styles[]`), **never** a component `styles`/`styleUrls` — Angular view
  encapsulation rewrites selectors and the controls/popups render unstyled.

## The zoneless-Angular lifecycle

Pick the creation hook by whether the map host is **always** in the DOM:

| Host                                           | Create with                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Always rendered (unconditional element)        | `afterNextRender` + `viewChild.required` — runs once, SSR-safe                 |
| Conditional / re-mountable (`@if`, tab switch) | `effect()` on an **optional** `viewChild()` — create/teardown on mount/unmount |

The fire `IncidentMapComponent` renders its canvas inside `@if (hasPoints())`, so the host appears and
disappears as the active set gains or loses points. Use the **effect** pattern: one `effect` tracks the
optional `viewChild()`, creates the map when the element arrives, and tears it down when it leaves (so the
empty state re-mounts a fresh map). `viewChild.required` + `afterNextRender` would throw — or silently never
build — when the element is absent at first render. Drive every imperative call from `effect()`s reading
signals, and tear down in `DestroyRef.onDestroy`.

```ts
import {
  ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed,
  effect, inject, input, untracked, viewChild, type ElementRef,
} from '@angular/core';
import type { Map as MlMap } from 'maplibre-gl';

const VOYAGER = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

@Component({
  selector: 'app-incident-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hasPoints()) {
      <!-- host MUST have a non-zero height or the map renders at 0px -->
      <div #mapHost class="incident-map__canvas" tabindex="0" [attr.aria-label]="ariaLabel()"></div>
    }
  `,
  styles: [`.incident-map__canvas { display: block; inline-size: 100%; block-size: 14rem; }`],
})
export class IncidentMapComponent {
  readonly points = input.required<readonly MapPoint[]>();
  protected readonly hasPoints = computed(() => this.points().length > 0);
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('mapHost'); // OPTIONAL — may be absent
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  private map: MlMap | null = null;

  constructor() {
    // Create on mount, tear down on unmount. Tracks ONLY the viewChild; everything else runs untracked.
    // Fires on the first mount AND every re-mount — a single afterNextRender would not rebuild the map
    // after the empty state hid and re-showed the canvas.
    effect(() => {
      const el = this.host()?.nativeElement;
      untracked(() => {
        if (el && this.map?.getContainer() !== el) void this.createMap(el);
        else if (!el && this.map) this.teardownMap();
      });
    });
    // Imperative sync: each effect is a no-op until the map exists. Read the signal, act untracked.
    effect(() => {
      const dark = this.theme.isDark();
      untracked(() => this.map?.setStyle(dark ? DARK_MATTER : VOYAGER, { diff: true /* + transformStyle */ }));
    });
    effect(() => {
      const pts = this.points();
      untracked(() => (this.map?.getSource('incidents') as GeoJSONSource | undefined)?.setData(toFc(pts)));
    });
    this.destroyRef.onDestroy(() => this.teardownMap());
  }

  private async createMap(container: HTMLElement): Promise<void> {
    const { Map, NavigationControl, ScaleControl } = await import('maplibre-gl');
    if (this.destroyRef.destroyed) return; // guard the async gap (NG0911)
    const map = new Map({
      container,
      style: this.theme.isDark() ? DARK_MATTER : VOYAGER,
      center: [144.9631, -37.8136], // [lng, lat] — Melbourne; NOT Leaflet's [lat, lng]
      zoom: 6,
      maxPitch: 85,               // raised from 60 for 3D terrain
      attributionControl: false,  // add it once, explicitly, below
    });
    this.map = map;
    map.addControl(new ScaleControl({ unit: 'metric' }));
    map.addControl(new NavigationControl({ visualizePitch: true }));
    map.on('load', () => { /* addSource / addLayer here — style must be ready */ });
  }

  private teardownMap(): void {
    this.map?.remove(); // disposes the canvas, workers, and every listener — no manual cleanup needed
    this.map = null;
  }
}
```

For an **always-present** host, the simpler form is fine and SSR-safe:

```ts
private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');
constructor() {
  afterNextRender(() => void this.createMap(this.host().nativeElement));
}
```

Notes:

- **No `NgZone`.** This app is zoneless (`provideZonelessChangeDetection`). There is no zone to run outside
  of; `NgZone.runOutsideAngular` is a no-op-shaped anti-pattern here. Signals are the bridge from map events
  back into the template — a signal write from `map.on('click', …)` schedules change detection correctly.
- **No `map.resize()` effect.** v3+ installs an internal `ResizeObserver` (`trackResize` defaults true), so the
  manual `invalidateSize()` Leaflet needed is gone. Call `map.resize()` only for cases the observer can't see.
- `map.on(...)` returns a `Subscription` in v5 and **does not chain** — `map.on(a).on(b)` no longer works.
- **CARTO hosts (for CSP).** Use `basemaps.cartocdn.com` for the `style:` URL (the canonical host;
  `tiles.basemaps.cartocdn.com` also serves the same style JSON). The style then loads its vector tiles,
  sprite, and glyphs from `tiles.basemaps.cartocdn.com` — so a Content-Security-Policy must allow **both**
  hosts (`connect-src`/`img-src`), plus `worker-src blob:` for MapLibre's web workers.

## `MapOptions` worth knowing

| Option                    | Use                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `container`               | The element (or id). Must have non-zero height.                                       |
| `style`                   | A style URL or `StyleSpecification`. The CARTO style URL *is* the basemap.            |
| `center` / `zoom`         | `[lng, lat]` and a number. Bearing/pitch/roll optional.                               |
| `maxPitch`                | Default 60; raise to ~85 for 3D terrain.                                              |
| `attributionControl`      | Set `false` and add `AttributionControl` once yourself (it persists across setStyle). |
| `pixelRatio`              | Cap for performance on hi-DPI; defaults to `devicePixelRatio`.                        |
| `canvasContextAttributes` | v5: WebGL context flags (e.g. `{ antialias: true }`, `preserveDrawingBuffer`).        |
| `maxBounds`               | Restrict panning to a region.                                                         |
| `locale`                  | Override control ARIA/label strings.                                                  |

Full list: `llms-full.txt` → `## MapOptions` (type-aliases section).

## The neverthrow boundary

Per the project rule, throw only for bugs/unrecoverable failures; expected errors use `Result`. For maps:

- **`new Map(...)` and `addImage` are the acceptable throwing seam.** A WebGL-unavailable failure or an
  `addImage` duplicate-id is an unrecoverable/programmer-context failure surfaced inside `afterNextRender`.
  Catch it and convert to a `tilesFailed` signal so the SVG/list fallback renders instead of crashing the
  route.
- **Value-returning async uses `ResultAsync`.** `map.loadImage(url)` for sprites and any Remult call feeding
  `MapPoint`s go through `ResultAsync.fromPromise(...)` and are handled with `match`/`mapErr` (the
  `must-use-result` rule). Don't let a rejected promise escape.
- Router navigation from a pin click stays fire-and-forget with `.catch()` — a concurrent-navigation
  rejection is non-actionable.

```ts
import { ResultAsync } from 'neverthrow';
// loadImage returns { data }; wrap it rather than letting a network rejection throw.
const icon = await ResultAsync.fromPromise(map.loadImage('/assets/pin.png'), (e) => e as Error);
icon.match(
  ({ data }) => { if (!map.hasImage('pin')) map.addImage('pin', data, { pixelRatio: 2 }); },
  (err) => this.tilesFailed.set(true),
);
```

## Coordinate primitives

- **Everything is `[lng, lat]`** (GeoJSON RFC order) — center, bounds, marker positions, source coordinates.
  This is the reverse of Leaflet's `[lat, lng]`; flip every coordinate when migrating.
- `LngLat` (`llms-full.txt:4111`): `new LngLat(lng, lat)`, `.toArray()`, `.wrap()`, `.distanceTo(other)`.
- `LngLatBounds` (`:4304`): `new LngLatBounds([w, s], [e, n])`, `.extend(lngLatLike)`, `.isEmpty()`. Build it
  from the *data*, not from a layer — a layer has no projected extent until the map has a view.
- `MercatorCoordinate` for metres-per-unit / 3D-model placement; `map.project`/`map.unproject` convert
  between `LngLat` and screen pixels (used by the accessibility DOM-mirror).

## Module-level engine config

These are set once, globally, before/around map creation (`llms-full.txt` functions section, 20822+):

- `addProtocol('pmtiles', handler)` / `removeProtocol` — register PMTiles, COG, or a custom tile fetcher,
  then use a normal `raster`/`vector` source with that scheme.
- `setRTLTextPlugin(url, lazy)` — required for correct Arabic/Hebrew label shaping.
- `setWorkerCount(n)` / `setMaxParallelImageRequests(n)` / `prewarm()` — tuning for heavy tile loads; see
  the [data-performance] skill before changing defaults.
- `getVersion()` — runtime version string (handy in a diagnostics/about panel).
- WebGL support: catch the `Map` constructor failure (or feature-detect) and fall back — see
  `check-if-webgl-is-supported` in the examples (`llms-full.txt` Part 4).
