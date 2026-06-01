# Camera, terrain, runtime style switching

## Contents

- The camera model
- Framing with `fitBounds` (and the side panel)
- Reduced motion (native, but partial)
- 3D terrain + hillshade (terrarium DEM)
- Globe / projection
- Runtime light/dark style switching (`setStyle` + `transformStyle`)

## The camera model

`CameraOptions` (`center`/`zoom`/`bearing`/`pitch`/`roll`/`padding`) is the destination; the methods animate
to it:

| Method                          | Behaviour                                                            |
| ------------------------------- | -------------------------------------------------------------------- |
| `jumpTo(opts)`                  | Instant. Also the reduced-motion fallback.                           |
| `easeTo(opts)` / `panTo(ll)`    | Short transition at roughly constant zoom.                           |
| `flyTo(opts)`                   | Cinematic zoom-out-then-in across distance (`speed`, `curve`).       |
| `fitBounds(bounds, opts)`       | Frame a set of features (see below).                                 |
| `cameraForBounds(bounds, opts)` | Compute center/zoom/bearing **without moving** (drive deck.gl view). |

`map.on('moveend', …)` signals arrival. Over 3D terrain, pass `freezeElevation: true` on animated moves so the
camera maths stays stable.

## Framing with fitBounds

Build the bounds from the **data**, not from a layer (a layer has no projected extent until the map has a
view — this is the crash the Leaflet code carefully avoided, and it disappears under MapLibre's source model
anyway). Cap `maxZoom` so a small extent does not frame to building level. This project's maps are embedded
widgets with no adjacent panel, so padding is symmetric (`24` all round, matching the spec); asymmetric
`PaddingOptions` exist for layouts that do have a side panel.

```ts
import { LngLatBounds } from 'maplibre-gl';
const bounds = new LngLatBounds();
for (const f of incidents) bounds.extend([f.lng, f.lat]); // extend by each [lng, lat]; rings by each vertex
if (!bounds.isEmpty()) {
  map.fitBounds(bounds, {
    padding: 24,            // symmetric — this project's maps have no side panel
    maxZoom: 13,
    bearing: 0,
    // animate defaults to honouring prefers-reduced-motion — do NOT force essential:true here
  });
}
```

`PaddingOptions`/`EdgeInsets` also offset the vanishing point for an off-centre focus (see
`offset-the-vanishing-point-using-padding`).

## Reduced motion

`flyTo`/`easeTo`/`fitBounds` automatically **skip to an instant jump** when the OS `prefers-reduced-motion` is
set — unless you pass `essential: true`. **Never** pass `essential: true` on focus-driven or non-critical
moves; it defeats WCAG 2.3.3. However, MapLibre does **not** auto-suppress your own `triggerRepaint`/
`requestAnimationFrame` loops (a beacon pulse, an animated icon) — gate those yourself:

```ts
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
if (!reduce.matches) startBeaconLoop();
reduce.addEventListener('change', (e) => (e.matches ? stopBeaconLoop() : startBeaconLoop()));
```

## 3D terrain + hillshade

Both read a `raster-dem` source. The free, keyless AWS terrarium DEM **must** use `encoding: 'terrarium'`
(the default `'mapbox'` mis-decodes it into garbage elevations). Per official guidance, use a **separate** DEM
source instance for terrain and for hillshade, and raise `maxPitch` (done at construction).

```ts
const TERRARIUM = {
  type: 'raster-dem' as const,
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tileSize: 256,
  maxzoom: 13,            // terrarium's native max; cap the camera maxZoom at 13 too
  encoding: 'terrarium' as const,
  attribution: 'Tilezen Joerd; USGS, NASA, NOAA, Geoscience Australia',
};
map.on('load', () => {
  map.addSource('dem', TERRARIUM);
  map.setTerrain({ source: 'dem', exaggeration: 1.4 });          // drape the basemap over the DEM (1.4 = the project's tuned constant)
  map.addSource('dem-hillshade', { ...TERRARIUM });              // separate instance for the shade layer
  map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem-hillshade',
    paint: { 'hillshade-method': 'multidirectional', 'hillshade-exaggeration': 0.6 } }, firstSymbolId(map));
});
```

- `getTerrain()` reads the current config; `setTerrain(null)` disables it.
- `queryTerrainElevation([lng, lat])` returns ground height (× exaggeration) — use it for 3D object placement
  rather than trusting `queryRenderedFeatures` coordinates when pitched.
- `setSky({...})` adds atmosphere/fog (see `sky-fog-terrain`).
- `terrain` lifecycle: `map.on('terrain', …)`.

## Globe / projection

v5 supports a **globe** projection. Toggle with `GlobeControl` or `map.setProjection({ type: 'globe' })`;
`MapProjectionEvent` reports changes. Planet-size-vs-zoom differs from flat Mercator (see
`zoom-and-planet-size-relation-on-globe`). deck.gl v9.1+ interleaves with the v5 globe. `renderWorldCopies`
toggles repeated worlds on the flat projection.

## Runtime light/dark style switching

A theme toggle swaps the whole basemap with `setStyle(url, { diff, transformStyle })`. Because CARTO Voyager
and Dark Matter ship **different sprite/glyph URLs**, the diff is forced into a **full rebuild** on every swap
— so your custom sources, layers, and terrain are dropped unless `transformStyle` carries them forward, and
runtime `addImage` icons must be re-added on `style.load` (they are renderer state `transformStyle` cannot
carry). `IControl`s (Attribution, Navigation, a deck.gl overlay) persist — do **not** re-add them.

```ts
const CUSTOM_SOURCES = ['incidents', 'dem', 'dem-hillshade'];
// 'hillshade' MUST be in this list: it is an ordinary style-spec layer, so if transformStyle does not carry
// it, the first theme swap silently drops the hillshading (the dem-hillshade SOURCE alone renders nothing).
const CUSTOM_LAYERS = ['hillshade', 'perimeter-fill', 'perimeter-line', 'extent-fill', 'extent-line', 'incident-pins'];

function swapTheme(map: Map, nextUrl: string): void {
  map.setStyle(nextUrl, {
    diff: true,
    transformStyle: (previous, next) => {
      if (!previous) return next;                       // null-guard: map may have been created style-less
      const sources = { ...next.sources };
      for (const id of CUSTOM_SOURCES) if (previous.sources[id]) sources[id] = previous.sources[id];
      // Re-insert custom layers BENEATH the next style's first symbol layer (keep the label sandwich).
      const firstSymbol = next.layers.findIndex((l) => l.type === 'symbol');
      const carried = previous.layers.filter((l) => CUSTOM_LAYERS.includes(l.id));
      const layers = firstSymbol < 0
        ? [...next.layers, ...carried]
        : [...next.layers.slice(0, firstSymbol), ...carried, ...next.layers.slice(firstSymbol)];
      return { ...next, sources, layers };
    },
  });
}
// Re-add renderer-only state after EVERY swap (style.load fires on initial load and each setStyle):
map.on('style.load', () => {
  void addPinImages(map);          // addImage icons do not survive setStyle
  reapplyTerrain(map);             // if you carried the dem source but setTerrain was reset
  reapplyFeatureState(map);        // setData/style swap clears feature-state
});
```

Style classes/types: `Style`, `StyleSwapOptions` (`diff`, `transformStyle`), `StyleOptions`,
`TransformStyleFunction` — `llms-full.txt` type-aliases section. The `change-a-layers-color-with-buttons` and
`add-a-new-layer-below-labels` examples show the simpler in-place edits (`setPaintProperty`, `beforeId`).
