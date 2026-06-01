---
name: maplibre-gl
description: "MapLibre GL JS v5 (web) — the Map class, GeoJSON/vector/raster/raster-dem sources, fill/line/symbol/circle/heatmap/fill-extrusion/hillshade layers, data-driven expressions, feature-state + promoteId, the label sandwich (beforeId), runtime images (addImage) and setStyle/transformStyle theme switching, camera (flyTo/easeTo/fitBounds), 3D terrain, controls, Marker/Popup, events and queryRenderedFeatures, zoneless-Angular integration. Use when writing or reviewing TypeScript that imports from 'maplibre-gl', building interactive web maps, migrating from Leaflet or Mapbox GL, or working on the fire-incident map. GL JS only — not MapLibre Native, Martin, or MLT."
user-invocable: false
---

# MapLibre GL JS API Reference

API-level knowledge for **MapLibre GL JS v5** (the WebGL/TypeScript web library). It complements the
project's Angular/styling/neverthrow rules — those say WHICH patterns to follow; this shows HOW to drive
the MapLibre APIs correctly, and which non-obvious behaviours bite.

**Core mental model:** a map is a **style** — an ordered list of *layers* over named *sources*. Data lives
in a source (GeoJSON, vector, raster, raster-dem); a layer is one visual reading of it (fill, line, symbol,
circle, heatmap, …). Appearance is declared with **expressions** (`['match', ['get','status'], …]`), not
imperative draw calls. You insert your data layers into the basemap with `beforeId` (the *label sandwich*).

## Current version

!`grep -o '"maplibre-gl": "[^"]*"' package.json 2>/dev/null || echo 'not installed — pin ^5 (5.24.0)'`

Pin **`^5`** (docs bundled here are 5.24.0). Do **not** adopt v6 yet — it is ESM-only, WebGL2-only, and
still pre-release; see [common-mistakes.md](common-mistakes.md). v5 ships its own `.d.ts` (no `@types`).

## References

- [Map setup](map-setup.md) — `new Map`/`MapOptions`, zoneless-Angular lifecycle, dynamic import + global
  CSS, neverthrow boundary, engine config (RTL, workers, `addProtocol`), coordinate primitives, teardown
- [Sources and layers](sources-and-layers.md) — source types, the layer types, the label sandwich,
  data-driven expressions, `feature-state` + `promoteId`, metre-radius circles, runtime images, clustering
- [Markers, popups, controls](markers-popups-controls.md) — GL symbol pins vs DOM `Marker`/`Popup`, built-in
  controls, gesture handlers, the event surface, `queryRenderedFeatures`, the WCAG accessibility companion
- [Camera, terrain, style](camera-terrain-style.md) — `flyTo`/`easeTo`/`fitBounds` + reduced motion, 3D
  terrain + hillshade (terrarium DEM), globe/projection, runtime light/dark `setStyle` + `transformStyle`
- [Common mistakes](common-mistakes.md) — the 14 gotchas that fail silently, with corrections
- [Full docs](llms-full.txt) — official v5.24.0 docs assembled offline: guides, 174 API pages, the style
  spec, and 133 examples. Grep it, or read by line range (index below). Every item is a `## Heading`.

When the quick-reference files are not enough, read targeted sections from `llms-full.txt`. Every class,
type, example, and style-spec section is a unique `##` heading, so `grep -n '^## Map$' llms-full.txt`
jumps straight to it.

## Section index (llms-full.txt)

| Section                                                   | Lines       |
| --------------------------------------------------------- | ----------- |
| Guides (incl. Leaflet→MapLibre migration at 253)          | 15–669      |
| API — Classes (Map 4884, Marker 9767, Popup 10746, …)     | 674–14797   |
| API — Interfaces (CustomLayerInterface, IControl, Source) | 14798–16004 |
| API — Type aliases (MapOptions and every `*Options`)      | 16005–20821 |
| API — Functions (addProtocol, setRTLTextPlugin, …)        | 20822–21354 |
| API — Enumerations + Variables (EXTENT)                   | 21355–21678 |
| Style spec (root/sources/layers/expressions/terrain/…)    | 21679–28021 |
| Examples (133, e.g. create-a-hover-effect, 3d-terrain)    | 28022–37814 |

Key anchors: `GeoJSONSource` 2175 · `RasterDEMTileSource` 11435 · `Style` 12743 · `LngLat` 4111 ·
`LngLatBounds` 4304 · style-spec `layers` 22687 · `expressions` 24766 · `sources` 22063.

## Non-negotiables (these fail silently)

These are the things a capable agent gets wrong by default — confirmed by baseline testing. Read
[common-mistakes.md](common-mistakes.md) for the full why/fix.

1. **Version** — pin `maplibre-gl@^5` (5.24.0). Models default to v4 or `@latest`; both are wrong here.
2. **Coordinates are `[lng, lat]`** everywhere (GeoJSON order) — the *opposite* of Leaflet's `[lat, lng]`.
3. **`circle-radius` is in screen pixels, not metres.** A real ground radius must be a generated polygon
   ring (`turf.circle`, then a fill+line layer) — never a `circle` layer. See [sources-and-layers.md].
4. **`feature-state` needs an integer id.** String/UUID keys silently no-op unless the source sets
   `promoteId: '<prop>'`. Do not combine with `generateId`.
5. **`setStyle` rebuilds.** Custom sources/layers/terrain must be carried by `transformStyle`; runtime
   `addImage` icons are renderer state and must be re-added on `map.on('style.load', …)`.
6. **Label sandwich** — add data layers with `beforeId` = the basemap's first `symbol` layer id, or fire
   geometry covers the place labels.
7. **The canvas is invisible to assistive tech.** GL features are pixels — a DOM-mirror companion +
   `aria-live` + a `feature-state` focus highlight is mandatory, not optional. See [markers-popups-controls.md].

## Decision trees

### Which source type?

| Data                                                        | Source                                                |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| In-memory/fetched GeoJSON (feature-state, clustering, live) | `geojson` — set `promoteId` for UUID keys             |
| Pre-rendered vector tiles (MVT/TileJSON)                    | `vector`                                              |
| Raster XYZ / WMS imagery (satellite, weather)               | `raster`                                              |
| Elevation for terrain and/or hillshade                      | `raster-dem` (`encoding:'terrarium'`, `tileSize:256`) |
| Single still image / video / live canvas                    | `image` / `video` / `canvas`                          |
| COG / PMTiles                                               | `addProtocol(...)` then a normal raster/vector source |
| deck.gl analytics overlay                                   | not a source — `MapboxOverlay({interleaved:true})`    |

### Which layer type?

| Goal                                            | Layer                                                     |
| ----------------------------------------------- | --------------------------------------------------------- |
| Polygon fill (perimeter, generated extent ring) | `fill` (+ a `line` for a weighted outline)                |
| Outline / linework                              | `line`                                                    |
| Fixed **ground-metre** radius                   | `turf.circle` polygon → `fill`+`line` (NOT `circle`)      |
| Status pin (icon, data-driven)                  | `symbol` with `icon-image` (Approach B — not a Marker)    |
| Pulsing beacon / dot / cluster bubble           | `circle` (pixel radius)                                   |
| Density / hotspot surface                       | `heatmap`                                                 |
| 3D extruded prisms / buildings                  | `fill-extrusion`                                          |
| Relief shading / elevation tint                 | `hillshade` / `color-relief` (need a `raster-dem` source) |
| Bespoke WebGL / three.js / deck.gl              | `CustomLayerInterface`                                    |

### Which camera method?

| Need                                               | Method                                                  |
| -------------------------------------------------- | ------------------------------------------------------- |
| Instant move (and the reduced-motion fallback)     | `jumpTo`                                                |
| Short transition at roughly constant zoom          | `easeTo` / `panTo`                                      |
| Cinematic zoom-out-then-in across distance         | `flyTo` (`freezeElevation:true` over terrain)           |
| Frame a set of features                            | `fitBounds(bounds, {padding, maxZoom})` — reset bearing |
| Compute center/zoom without moving (drive deck.gl) | `cameraForBounds`                                       |

Reduced motion: `flyTo`/`easeTo`/`fitBounds` skip to a jump when the OS prefers it — **never** pass
`essential:true` on focus/non-critical moves, or you defeat WCAG. Custom rAF loops are *not* auto-suppressed.

### Symbol-layer pin vs DOM Marker?

| Situation                                                   | Use                                            |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Many data-driven status pins, queryable, deck.gl-compatible | `symbol` layer (the default for this project)  |
| A few one-off draggable/interactive HTML markers            | `Marker`                                       |
| Per-feature keyboard focus + screen-reader announcement     | DOM-mirror buttons over `getCanvasContainer()` |
| Rich HTML bubble anchored to a coordinate                   | `Popup`                                        |

## This project (fire-incident map)

The active migration replaces Leaflet 1.9.4 with MapLibre GL JS v5. Locked decisions live in the
`maplibre-campaign` memory; the concrete API mapping and the current component's migration are in
[markers-popups-controls.md](markers-popups-controls.md) and [sources-and-layers.md](sources-and-layers.md).

- **Basemaps** (free, keyless, GL styles): light = CARTO **Voyager**
  `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json`; dark = **Dark Matter**
  `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`. CARTO's hosted tiles are
  non-commercial — showcase-only; keep the OSM + CARTO attribution.
- **Approach B (fully GL-native):** status pins are `symbol` layers with sprite/SDF icons + data-driven
  expressions — no DOM `divIcon` markers.
- **Status colours** are tuned for ≥3:1 on both basemaps with a mandatory theme-aware halo; colour is never
  the sole channel (glyph + label too). Rosé Pine stays for app chrome.
- **Angular:** the incident-map canvas sits behind `@if (hasPoints())`, so construct the `Map` in an
  `effect()` on an **optional** `viewChild()` (create on mount, tear down on unmount) — not
  `afterNextRender`+`viewChild.required`, which suits an always-present host; dynamic `import('maplibre-gl')`
  to code-split the ~270 KB bundle; load `maplibre-gl.css` **globally**; dispose in
  `DestroyRef.onDestroy(() => map.remove())`. Drive imperative calls from `effect()`s reading signals.
- **neverthrow:** `new Map(...)` / `addImage` are the acceptable *throwing* seam (catch → set a `tilesFailed`
  signal → render the SVG/list fallback). Wrap value-returning async (`loadImage`, data fetch) in
  `ResultAsync.fromPromise`. See [map-setup.md](map-setup.md).

## Regenerating llms-full.txt

`llms-full.txt` is assembled from the official docs by `scripts/build-llms-full.mjs`. To refresh it for a new
release: `node scripts/build-llms-full.mjs <tag>` (e.g. `v5.25.0`). It needs `turndown`, `cheerio`, and
`turndown-plugin-gfm` (install transiently; do **not** add them to the repo). The script is self-contained —
it discovers the API page list and example list from the repo tree at that tag.
