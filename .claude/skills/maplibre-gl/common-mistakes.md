# Common mistakes

The MapLibre GL JS traps that **fail silently** — no exception, just wrong output or a dead feature. Each is a
real thing a capable agent gets wrong by default (confirmed in baseline testing). Fix listed for each.

## Contents

1. Installing v4 or v6 instead of `^5`
2. `[lat, lng]` coordinate order
3. A `circle` layer for a metre radius
4. `feature-state` without `promoteId`
5. Assuming `setStyle` keeps your layers
6. `addImage` icons vanishing after `setStyle`
7. Forgetting the label sandwich (`beforeId`)
8. No accessibility companion for the canvas
9. `essential: true` on camera moves
10. `match`/`step`/`case` shape errors
11. Nesting `['zoom']` inside a data branch
12. `fill-outline-color` for a weighted outline
13. Symbol collision hiding pins
14. Shipping CARTO tiles commercially / disabling attribution

---

## 1. Installing v4 or v6 instead of ^5

- **Wrong:** `npm install maplibre-gl` (resolves to a v4 you remember) or `@latest` (a v6 pre-release), or
  following a `import * as maplibregl` v6 tutorial.
- **Right:** pin **`maplibre-gl@^5`** (5.24.0 current). Keep named imports: `import { Map } from 'maplibre-gl'`.
- **Why:** v6 (still pre-release in 2026) is ESM-only (UMD/CSP bundles dropped), WebGL2-only (no WebGL1
  fallback), and ES2022-targeted. v5 is the final stable line, ships built-in `.d.ts`, keeps UMD+CSP bundles,
  and is the deck.gl-interleave path. Re-verify before any v6 jump.

## 2. `[lat, lng]` coordinate order

- **Wrong:** `center: [-37.81, 144.96]` (Leaflet habit), `new LngLat(lat, lng)`.
- **Right:** `[lng, lat]` everywhere — `center: [144.96, -37.81]`. GeoJSON RFC order.
- **Why:** MapLibre/GeoJSON are longitude-first; Leaflet is latitude-first. Flipped coordinates either land
  far from the intended spot or get clamped at the latitude limit — silently, with no error (flipping
  Melbourne gives latitude 144.96, which is out of range and gets clamped). Existing GeoJSON perimeters are
  already `[lng, lat]` and port unchanged; flip every hand-written center/marker/bounds.

## 3. A `circle` layer for a metre radius

- **Wrong:** `circle` layer with `circle-radius` (optionally zoom-interpolated) to draw a 5 km impact zone.
- **Right:** generate a polygon ring — `turf.circle([lng,lat], km, { steps: 64 })` — and render it as
  `fill`+`line`, like a perimeter.
- **Why:** `circle-radius` is in **screen pixels**, not ground metres. Web-Mercator metres-per-pixel varies
  with latitude and zoom, so a pixel circle is correct at only one reference point and breaks under tilt. Only
  a true polygon reprojects per-frame and stays geographically accurate. `circle` layers are for dots, beacons,
  and cluster bubbles.

## 4. feature-state without promoteId

- **Wrong:** `map.setFeatureState({ source: 'incidents', id: 'a-uuid' }, { hover: true })` on a source with no
  `promoteId`.
- **Right:** set `promoteId: 'id'` on the source once; then string/UUID ids work. Do **not** also set
  `generateId`.
- **Why:** without `promoteId`, a feature id must be an integer (or a string castable to one, e.g. `'5'`) —
  UUID/non-numeric string keys silently no-op. `promoteId` maps a property to the id. `generateId` overwrites the id with the array index, destroying the stable join.
  `setData()` clears all feature-state — re-apply after a rebuild.

## 5. Assuming setStyle keeps your layers

- **Wrong:** `map.setStyle(darkUrl)` on a theme toggle and expecting fire sources/layers/terrain to survive
  because `diff: true` is the default.
- **Right:** `setStyle(url, { diff: true, transformStyle: (prev, next) => …carry custom sources + layers
  (re-inserted before the first symbol) + terrain… })`. Null-guard `prev`.
- **Why:** Voyager and Dark Matter have different sprite/glyph URLs, so the diff is forced into a **full
  rebuild** and everything custom is dropped unless `transformStyle` carries it. Naively spreading
  `...next.layers` then your layers also puts fire geometry above labels — insertion order matters.

## 6. addImage icons vanishing after setStyle

- **Wrong:** register pin sprites once after the first load and assume they persist through a theme swap.
- **Right:** `map.on('style.load', () => addPinImages(map))` (fires on initial load AND every `setStyle`),
  guard each with `map.hasImage(id)`, and add a `styleimagemissing` safety net.
- **Why:** `addImage` icons are **renderer state, not style state** — `transformStyle` cannot carry them and
  the rebuild drops them. A symbol layer keyed on `icon-image` then renders nothing (silent missing-image
  warnings) until they are re-added.

## 7. Forgetting the label sandwich

- **Wrong:** `map.addLayer({ … })` with no `beforeId`.
- **Right:** `map.addLayer(layer, firstSymbolId(map))` where `firstSymbolId` is the first
  `getStyle().layers` entry with `type === 'symbol'` (guard `undefined`). Re-resolve after `setStyle`.
- **Why:** without `beforeId` the layer goes on top of everything — fire fills/rings cover the basemap's place
  labels. The sandwich keeps data under labels but pins above the basemap.

## 8. No accessibility companion for the canvas

- **Wrong:** rely on the canvas `role="region"`/`aria-label`/`KeyboardHandler` to make individual features
  focusable, and assume AXE will catch map a11y.
- **Right:** build a DOM-mirror — one transparent, ≥24×24 px, focusable element per feature over
  `getCanvasContainer()`, synced on `move`/`render` via `map.project()`; drive a `feature-state` focus
  highlight; announce via `aria-live="polite"`. Keep the list/SVG fallback.
- **Why:** GL features are canvas pixels with **no DOM** — invisible to assistive tech and AXE, with no native
  per-feature focus. The DOM-mirror is permanent architecture, not a stopgap.

## 9. essential: true on camera moves

- **Wrong:** `map.flyTo({ …, essential: true })` so the demo always animates.
- **Right:** omit `essential` on focus/non-critical moves; let MapLibre skip to a jump under
  `prefers-reduced-motion`. Gate your own rAF/`triggerRepaint` loops on `matchMedia` yourself.
- **Why:** `essential: true` overrides the OS reduced-motion preference, defeating WCAG 2.3.3. MapLibre honours
  the preference for `flyTo`/`easeTo`/`fitBounds` automatically — but not for custom animation loops.

## 10. match/step/case shape errors

- **Wrong:** a `match` with no fallback, non-literal labels, or duplicate labels; mixing up `case` (boolean
  conditions) and `step` (ascending numeric stops with a leading base value).
- **Right:** `['match', input, label, out, …, fallback]` — fallback **mandatory** and last, labels literal and
  unique (an array maps several inputs to one output). `['case', cond, out, …, default]`.
  `['step', input, base, stop1, out1, …]`.
- **Why:** an unmatched `match` with no fallback throws at style-parse; the others produce wrong branches with
  no error.

## 11. Nesting ['zoom'] inside a data branch

- **Wrong:** `['match', ['get','status'], 'going', ['interpolate', …, ['zoom'], …], …]`.
- **Right:** put `['zoom']` at the **top level** — an outer `interpolate`-by-zoom whose stop values are
  `match`-by-data expressions.
- **Why:** `['zoom']` is only valid at the top level of a paint/layout property (or as a `step`/`interpolate`
  input), never inside a feature-data branch. The reverse nesting is a parse error.

## 12. fill-outline-color for a weighted outline

- **Wrong:** `paint: { 'fill-outline-color': '#000' }` expecting a 2 px toned border.
- **Right:** add a separate `line` layer over the `fill` for any weighted/opacity-blended outline.
- **Why:** `fill-outline-color` renders a non-tunable 1 px line that ignores `fill-opacity` — it cannot match
  the perimeter/ring stroke weight.

## 13. Symbol collision hiding pins

- **Wrong:** a `symbol` pin layer with default collision — overlapping pins silently disappear.
- **Right:** `'icon-allow-overlap': true` (or `'icon-overlap': 'always'`) so every pin shows; control overlap
  winners with `symbol-sort-key` + `symbol-z-order`.
- **Why:** symbol collision detection hides overlapping icons/labels by default. `icon-overlap` (enum) is the
  newer form and takes precedence over `icon-allow-overlap` (boolean) if both are set.

## 14. Shipping CARTO tiles commercially / disabling attribution

- **Wrong:** ship the keyless CARTO Voyager/Dark Matter tiles in a commercial deployment, or set
  `attributionControl: false` and never re-add it.
- **Right:** treat CARTO as showcase/dev-only (or plan Protomaps/OpenMapTiles/self-host); add
  `AttributionControl` once (it persists across `setStyle`); always surface the OSM + CARTO credit.
- **Why:** CARTO's FAQ requires an Enterprise licence for commercial use of the hosted tiles (the open licence
  covers the *style code*, not the tile service). The attribution rides in the tiles' TileJSON, so the control
  surfaces it automatically — removing it breaches the terms.
