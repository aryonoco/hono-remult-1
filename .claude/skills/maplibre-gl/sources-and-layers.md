# Sources and layers

## Contents

- Sources: what holds the data
- Layer types (the visual readings) + key paint/layout props
- The label sandwich (`beforeId`)
- Expressions: data-driven styling
- `feature-state` + `promoteId` (hover/focus highlight)
- Metre-radius circles (generated polygon rings)
- Runtime images and sprites (re-add on `style.load`)
- Live updates and clustering
- paint vs layout (the lifecycle that decides what you can animate)
- Worked example: the fire layers

## Sources

A **source** holds data; a **layer** is one visual reading of it. Add a source once, then any number of
layers can read it. Set data once and styling lives entirely on the layers.

| Type                     | For                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `geojson`                | In-memory/fetched features. Supports `promoteId`, clustering, `setData`/`updateData`. |
| `vector`                 | MVT vector tiles (TileJSON or `tiles[]`). Layers need a `source-layer`.               |
| `raster`                 | XYZ/WMS bitmap tiles. `tileSize` (512 default; set 256 for OSM/XYZ 256px tiles).      |
| `raster-dem`             | Elevation for terrain + hillshade. `encoding:'terrarium'` for AWS DEM.                |
| `image`/`video`/`canvas` | A georeferenced still / clip / live canvas, pinned to 4 `coordinates`.                |

```ts
map.addSource('incidents', {
  type: 'geojson',
  data: featureCollection,    // a URL or an inline FeatureCollection
  promoteId: 'id',            // MANDATORY for string/UUID feature ids — see feature-state below
});
```

## Layer types

Style props split into **`paint`** (appearance) and **`layout`** (geometry/structure). See the lifecycle
section for why it matters.

| Layer            | Use here                              | Key props                                                                                                |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `fill`           | Perimeter / generated extent ring     | `fill-color` (match on status), `fill-opacity` (~0.35)                                                   |
| `line`           | Weighted toned outline                | `line-color`, `line-width` (px, zoom-interpolate), `line-dasharray`                                      |
| `symbol`         | **Status pins** (Approach B)          | `icon-image`, `icon-size`, `icon-anchor:'bottom'`, `icon-allow-overlap`, `text-field`, `symbol-sort-key` |
| `circle`         | Beacon/dot/cluster bubble (px radius) | `circle-radius` (PIXELS), `circle-color`, `circle-stroke-*`                                              |
| `heatmap`        | Density surface (Campaign 2)          | `heatmap-color` (ramp on `heatmap-density`), `heatmap-weight`, `heatmap-radius`                          |
| `fill-extrusion` | 3D prisms / buildings                 | `fill-extrusion-height` (m), `fill-extrusion-base`, `*-color`                                            |
| `hillshade`      | Relief shading                        | `hillshade-method` (`multidirectional`), `hillshade-exaggeration`                                        |
| `color-relief`   | Hypsometric tint                      | `color-relief-color` (ramp on `['elevation']`)                                                           |
| `raster`         | Satellite/WMS/COG imagery             | `raster-opacity`, `raster-resampling` (not data-driven)                                                  |
| `background`     | Solid backdrop                        | `background-color` (zoom only; sourceless)                                                               |

For the full property list of any layer, read `llms-full.txt` → `## STYLE-SPEC: layers` (line 22687).

## The label sandwich

Insert data layers **beneath the basemap's first `symbol` (label) layer** so place names stay readable on
top. Scan for it and pass its id as `beforeId`:

```ts
function firstSymbolId(map: Map): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
}
const beforeId = firstSymbolId(map);   // may be undefined (style with no labels) — addLayer accepts that
map.addLayer({ id: 'perimeter-fill', type: 'fill', source: 'incidents', paint: { /* … */ } }, beforeId);
```

Forgetting `beforeId` stacks fire geometry on top of every label. Re-resolve it after `setStyle` — CARTO
regenerates layer ids on each style.

## Expressions: data-driven styling

Expressions are Lisp-like JSON arrays evaluated per feature/zoom. They replace the per-tone CSS classes the
Leaflet version used. The workhorses:

| Operator        | Shape                                              | Use                                                                           |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `get`           | `['get','status']`                                 | Read a feature property                                                       |
| `match`         | `['match', input, label, out, …, fallback]`        | Discrete map (status → colour). Fallback **mandatory**, labels literal/unique |
| `case`          | `['case', cond, out, …, fallback]`                 | Boolean branches (feature-state, Major)                                       |
| `step`          | `['step', input, out0, stop1, out1, …]`            | Bins (icon-size by level, cluster colour)                                     |
| `interpolate`   | `['interpolate', ['linear'], ['zoom'], z1, v1, …]` | Smooth ramps (line-width by zoom, heatmap)                                    |
| `feature-state` | `['feature-state','hover']`                        | Runtime per-feature state (paint only)                                        |
| `concat`        | `['concat','pin-',['get','status']]`               | Build an `icon-image` id from data                                            |

```ts
'fill-color': [
  'match', ['get', 'status'],
  'going',      '#DA2D2D',
  'contained',  '#E8590C',
  'controlled', '#B36A00',
  'safe',       '#1F78C4',
  /* fallback */ '#6B7785',
],
```

Gotchas: `['zoom']` may appear only at the **top level** of a property expression (or as a `step`/`interpolate`
input) — never nested inside a `match`/`case` branch. To combine zoom *and* data, the outer expression is
`interpolate`-by-zoom whose stop values are themselves `match`-by-data. `feature-state` cannot be read in a
**layout** property (so you can't switch `icon-image` on hover — switch a paint colour or `icon-opacity`).

## feature-state + promoteId

Hover/focus highlighting toggles runtime state and reads it in a paint expression. It needs a stable feature
id — and `setFeatureState` only accepts an **integer** id unless the source maps a property via `promoteId`.
Fire incidents use **UUID strings**, so `promoteId` is mandatory or every call silently no-ops.

```ts
map.addSource('incidents', { type: 'geojson', data: fc, promoteId: 'id' }); // 'id' holds the UUID
// Do NOT also set generateId — it overwrites the id with the array index and breaks the stable join.

map.on('mousemove', 'perimeter-fill', (e) => {
  const f = e.features?.[0];
  if (!f) return;
  if (hovered !== null) map.setFeatureState({ source: 'incidents', id: hovered }, { hover: false });
  hovered = f.id as string;
  map.setFeatureState({ source: 'incidents', id: hovered }, { hover: true });
});
map.on('mouseleave', 'perimeter-fill', () => {
  if (hovered !== null) map.setFeatureState({ source: 'incidents', id: hovered }, { hover: false });
  hovered = null;
});

// paint reads the state (case on a boolean, with the default false):
'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, 0.3],
```

`setData()` clears all feature-state — re-apply it (keyed on the stable `promoteId` value) after a data
rebuild. Model `hover` and keyboard `focus` as two independent boolean keys so they compose.

## Metre-radius circles

`circle-radius` is in **screen pixels**, so a `circle` layer cannot represent a fixed ground distance — it is
only correct at one zoom/latitude and breaks under tilt. For a true extent radius, generate a polygon ring
with turf and render it as `fill`+`line`, exactly like a perimeter:

```ts
import circle from '@turf/circle';
// r metres = √(areaHa · 10000 / π); turf takes km. 64 steps is a smooth ring.
const radiusKm = Math.sqrt((areaHa * 10_000) / Math.PI) / 1000;
const ring = circle([lng, lat], radiusKm, { steps: 64, units: 'kilometers', properties: { status } });
// → add to a geojson source → fill + line layers (same status match expression as the perimeter)
```

The existing `areaRadiusMetres()` maths is preserved — its output now feeds `turf.circle`, not `L.circle`.
Use a `circle` layer only for pixel-radius things: a beacon pulse, a dot, or a cluster count bubble.

## Runtime images and sprites

Pin icons added via `addImage` / `loadImage` are **renderer state, not style state** — they are lost on every
`setStyle` (the light/dark swap). Re-register them on `style.load` (fires on first load *and* after each
`setStyle`), guard with `hasImage` (`addImage` throws on a duplicate id), and add a `styleimagemissing`
safety net:

```ts
async function addPinImages(map: Map): Promise<void> {
  for (const status of STATUSES) {
    const id = `pin-${status}`;
    if (map.hasImage(id)) continue;
    const { data } = await map.loadImage(`/assets/pins/${status}.png`);
    map.addImage(id, data, { pixelRatio: 2 });   // SDF: addImage(id, data, { sdf: true }) → recolour via icon-color
  }
}
map.on('style.load', () => void addPinImages(map));        // initial load AND every theme swap
map.on('styleimagemissing', (e) => { /* lazily generate e.id */ });
```

SDF icons (`{ sdf: true }`) let one base image be recoloured per feature with `icon-color` — ideal for a
single pin silhouette tinted by status. Animated beacons use a `StyleImageInterface` (see
`add-an-animated-icon-to-the-map` in `llms-full.txt`), but gate any rAF loop on `prefers-reduced-motion`.

## Live updates and clustering

- **Update data** without rebuilding layers: `(map.getSource('incidents') as GeoJSONSource).setData(fc)`.
  For incremental edits keyed by id, `updateData({ add, update, remove })` is cheaper than a full `setData`.
- **Cluster** by setting `cluster: true`, `clusterRadius`, `clusterMaxZoom` on the geojson source, then style
  the `point_count` with a `step` expression and add an unclustered-point layer. See `create-and-style-clusters`.

## paint vs layout

| Bucket   | Examples                                              | Cost / can animate?                                          |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `paint`  | `*-color`, `*-opacity`, `line-width`, halos           | GPU-cheap; `setPaintProperty` re-renders only — animate here |
| `layout` | `icon-image`, `icon-size`, `text-field`, `visibility` | Worker re-layout; set once via expression                    |

Consequences: the hover highlight is a **paint** expression toggled by `setFeatureState` (no re-layout); the
beacon pulse animates a paint property; graduated `icon-size`/`icon-image` are **layout**, so they're set once
declaratively, not animated. `visibility:'none'` is the cheap way to toggle a whole layer (legend filters).
Common trip: `text-color`/`icon-color` are paint, but `text-font`/`text-field` are layout.
