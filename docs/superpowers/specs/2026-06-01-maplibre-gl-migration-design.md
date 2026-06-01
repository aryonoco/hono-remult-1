# MapLibre GL Migration — Design Spec (Maps Campaign 1)

Date: 2026-06-01
Status: Approved direction; self-reviewed (4-lens adversarial review, 37 issues fixed); pending user review →
implementation plan
Branch: `feat/fire-incidents-tactical-redesign` (continues on the same branch — user decision)
Scope: `apps/web` only — the fire-incidents map component and the styles/tokens that feed it. No `libs/shared/domain`
or `apps/api` changes. Campaign 2 (the deck.gl fire-seasons analytics page) is **out of scope** and gets its own
brainstorm + spec once this campaign lands; this design must not block it (see §12).
Research record: every version-specific claim in this spec was verified against June-2026 documentation by an
8-agent research workflow; findings (with sources, code patterns and risks) live at
`.superpowers/maplibre-research-findings.json` (gitignored, durable). Spec-review record:
`.superpowers/maplibre-spec-review.json`. Key claims are marked **[verified]**.

---

## 1. Goal

Replace Leaflet with MapLibre GL JS across the app and rebuild the incident map fully GL-native, so the maps
match the quality bar of the rest of the "Tactical Command" redesign and visibly out-class the raster maps the
demo audience knows from ESRI/VertiGIS tooling: vector basemaps, native label layering, 3D terrain, cinematic
camera moves — all from key-less services.

**Success criteria:**

- Leaflet is fully removed: the `leaflet` dependency, all imports, the `@import 'leaflet/dist/leaflet.css'` in
  `styles.scss`, the dead Leaflet-DOM global CSS (see §3.1), and the leaflet-CJS build warning.
- The overview and detail maps render via MapLibre GL with: Voyager (light) / Dark Matter (dark) basemaps,
  fire geometry beneath basemap labels, metre-accurate extents, status pins, 3D terrain + hillshade,
  pitch/rotate/fly-to camera, metric scale bar, and the mandatory CARTO/OSM/DEM attribution (§5.1).
- WCAG 2.2 AA holds in both themes — including keyboard access to every fire and visible focus on the canvas.
- Behavioural contracts and `data-testid`s preserved per the §9.1 carry-over table; `bun run check:ci`, all
  tests, and `just ci` green.
- Zero lint suppressions; every map colour defined exactly once as a token (§7); no magic numbers (§3.4).

## 2. Locked decisions

| #   | Decision                     | Detail                                                                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Full Leaflet removal         | No hybrid period; one map stack                                                       |
| 2   | Approach B — fully GL-native | Geometry AND pins are GL layers; no DOM markers                                       |
| 3   | `maplibre-gl` ^5.24.0        | **[verified]** current stable; NOT v6 (pre-release, ESM/WebGL2-only)                  |
| 4   | Basemaps                     | CARTO GL styles, key-less (exact URLs in §5.1)                                        |
| 5   | CARTO licence stance         | **Non-commercial use only** (CARTO FAQ). Accepted solely because this is a private,   |
|     |                              | non-commercial demo for 3–4 viewers. Escape hatch if ever published: self-host the    |
|     |                              | open CARTO style code over OpenMapTiles/Protomaps tiles                               |
| 6   | Label sandwich               | Native: all data layers inserted beneath the basemap's first symbol layer             |
| 7   | Map colours                  | Sector-anchored palette (AFAC/CFS), **Safe = blue**; applies to the GL map, the SVG   |
|     |                              | fallback AND the map legend (one palette for everything map-related); Rosé Pine stays |
|     |                              | for all app chrome                                                                    |
| 8   | 3D terrain                   | AWS terrarium DEM (free) + hillshade; pitch/rotate/fly-to camera                      |
| 9   | Same branch                  | Work continues on `feat/fire-incidents-tactical-redesign`                             |

## 3. Architecture

### 3.1 Dependencies and removals

- **Remove:** the `leaflet` dependency; every Leaflet import; the `@import 'leaflet/dist/leaflet.css';` line in
  `styles.scss`; the now-dead Leaflet-DOM global CSS in `styles.scss` — the `.leaflet-control-attribution*`
  rules and the `.fire-marker*` / `.fire-circle--*` / `.fire-polygon--*` overlay-pane rules (GL pins/extents
  are canvas-rendered, not DOM, so these selectors can never match again).
- **Add:** `maplibre-gl@^5.24.0` — BSD-3-Clause, ships its own TypeScript types **[verified]**.
- **No turf dependency:** the research endorses `turf.circle` for ring generation; we deliberately reimplement
  its 64-step geodesic ring (~20 lines) in `map-geometry.ts` to avoid the dependency, and unit-test it against
  known areas/turf-equivalent outputs.

Bundle strategy **[verified]**: `maplibre-gl` (~270 KB gzip) is loaded via a memoised dynamic `import()`
(wrapped in `ResultAsync.fromPromise` — §8), so it never enters the eager bundle. Note: the existing
`project.json` budgets cover only `initial` and `anyComponentStyle` — they do **not** measure lazy chunks, so
containment comes from the dynamic-import architecture itself, not from a budget gate. Its CSS
(`maplibre-gl/dist/maplibre-gl.css`, ~10 KB gzip) is appended to the `styles` array in `apps/web/project.json`
(there is no build `angular.json`; the one under `tools/` is MCP-only).

### 3.2 File structure

```text
apps/web/src/app/features/fire-incidents/incident-detail/incident-map/
  incident-map.ts        component shell: inputs, template (canvas/fallback/legend/empty), signals, a11y wiring
  map-engine.ts          MapLibre lifecycle: dynamic import, create/destroy, style switching, camera, terrain
  map-style.ts           basemap URLs, layer definitions, label-sandwich insertion, palette access
  map-symbology.ts       pin image generation (SVG → ImageBitmap → addImage), expressions, pulse targets
  map-geometry.ts        metre-accurate circle rings, bounds derivation, SVG-fallback projection (pure functions)
  map-a11y.ts            DOM mirror: focusable per-fire elements, focus→feature-state, aria-live
  incident-map.spec.ts   behavioural tests (carry-over per §9.1) + new GL-specific tests
  map-geometry.spec.ts   pure-function tests for rings/bounds/projection
  map-palette-contrast.spec.ts  contrast guard for the §7 palette (new, hex-based)
  marker-symbology.ts    DELETED — pulse-target logic moves to map-symbology.ts; the divIcon HTML/class
                         builders (markerHtml, markerClassName, markerStackOffset) have no GL equivalent and
                         are deleted along with their tests (§9.1)
```

**What changes outside this directory:**

- `tone-classes.ts`: `MARKER_TONE_CLASS` (the `.fire-marker--*` legend-swatch hooks) is **removed**; the map
  legend recolours to the map palette (§7). `SPINE_TONE`, `POLYGON_TONE_CLASS`, `CIRCLE_TONE_CLASS` survive
  only where the SVG fallback still needs them, re-pointed at the map tokens (§7).
- `tailwind.css` `@theme`: the new `--color-map-*` tokens (§7).
- `styles.scss`: Leaflet CSS removals (§3.1).
- `apps/web/project.json`: the MapLibre CSS entry.

The component's **public API does not change**: inputs `points`, `locationDescription`, `singleZoom`,
`linkable` keep their names, types and semantics, and `MapPoint` is untouched — so `overview.ts`,
`overview.html` and `incident-detail.ts`/`.html` (including its `@defer (on viewport)` wrapper) require zero
changes.

### 3.3 Component lifecycle (zoneless Angular 21) **[verified, corrected by review]**

The map canvas is conditionally rendered (`@if (hasPoints())`, inside the `@else` branch of
`@if (tilesFailed())`, and the whole component sits inside `@defer (on viewport)` on the detail page). A
one-shot `afterNextRender` therefore **cannot** own map construction — it would never rebuild the map after the
empty state or a deferred reveal. The existing, deliberate pattern is preserved:

- `viewChild<ElementRef>('mapEl')` (NOT `.required` — the canvas is legitimately absent in the empty/fallback
  states) + an `effect()` that creates the map when the element appears and tears it down when it leaves
  (untracked body), exactly as today (`incident-map.ts:425-434`).
- Inside that effect, the first creation awaits the memoised dynamic `import('maplibre-gl')` (§8).
- Teardown via the same effect on element removal AND `DestroyRef.onDestroy(() => map.remove())`;
  `map.remove()` disposes all listeners **[verified]**.
- A second `effect()` tracks `points()` and, when the map exists, pushes data: `setData` on the source,
  mirror rebuild, pulse-target recompute, focus re-application (§4.7). The framed-once latch lives here,
  exactly mirroring today's `framed` flag semantics.
- MapLibre v5 notes **[verified]**: `map.on()` returns a `Subscription` (never chain `.on().on()`); MapLibre ≥3
  attaches its own `ResizeObserver` (no `invalidateSize` equivalent needed); event handlers write to signals
  (zoneless-safe).

### 3.4 Lint & strictness compliance

- `noMagicNumbers` is an error outside spec files: every numeric literal in the new modules (64 ring steps,
  exaggeration 1.4, tile size 256, max zoom 13, padding 24, halo width 2, icon sizes…) is a named
  `const` — mirroring the existing constant block style of `incident-map.ts`. `SQM_PER_HECTARE` is reused, not
  re-declared.
- Strict TS (`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`):
  feature properties get a typed interface (`FireFeatureProperties`) and bracket-access narrowing helpers; the
  first-symbol-layer scan returns `string | undefined` and `beforeId` is passed only when defined; **no `any`
  casts anywhere**.

## 4. Rendering design

### 4.1 Source

One GeoJSON source `fires`. Every feature carries typed
`properties: { id, tone, level, major, kind }` where:

- `tone` **is** the existing `StatusTone` union — exactly the six values
  `going | contained | controlled | safe | neutral | missing` (the same domain as the §7 palette table).
- `kind ∈ perimeter | extent | pin` distinguishes the geometry role.
- `promoteId: 'id'` is **mandatory** **[verified]**: feature-state silently no-ops for string/UUID ids without
  it. `generateId` must NOT be combined with it.
- Feature-state is cleared by `setData()` **[verified]** — the a11y layer re-applies focus state after rebuilds
  (§4.7).

### 4.2 Layer stack — the single canonical z-order

Bottom-to-top, ALL inserted with `beforeId` = the basemap's first `type === 'symbol'` layer (scanned at
runtime, typed `string | undefined`, guarded) **[verified]**:

| Z   | Layer id                                      | Type        | Content                                             |
| --- | --------------------------------------------- | ----------- | --------------------------------------------------- |
| 1   | `fire-hillshade`                              | hillshade   | terrain shading (lowest — under all fire geometry)  |
| 2   | `fire-extent-fill` / `fire-extent-line`       | fill / line | metre-accurate area-estimate rings                  |
| 3   | `fire-perimeter-fill` / `fire-perimeter-line` | fill / line | true mapped GeoJSON perimeters                      |
| 4   | `fire-pulse`                                  | circle      | animated beacon behind "loud" pins                  |
| 5   | `fire-pins`                                   | symbol      | the status tag-pins                                 |
| 6   | `fire-focus-ring`                             | line        | feature-state-driven keyboard-focus indicator (top) |

Basemap labels render above all of these (the label sandwich). The §9 layer-order test asserts exactly this
table.

Fidelity order per fire is preserved exactly as today: perimeter polygon → area circle → bare pin, and the
colour-independent text channel is unchanged (see the §4.8 requirement crosswalk).

### 4.3 Extent circles **[verified]**

GL `circle` layers size in **screen pixels** and cannot represent ground distance. Extent circles are therefore
generated as 64-vertex geodesic polygon rings (radius = `√(areaHa·SQM_PER_HECTARE/π)` metres, same formula as
today) by `map-geometry.ts`, rendered as fill/line layers.

### 4.4 Pins **[verified]**

- The tag-pin design is rendered offscreen (SVG → `ImageBitmap`) and registered via
  `map.addImage(id, bitmap, { pixelRatio: devicePixelRatio })`. Image key dimensions: **status × level ×
  major** (6 × 3 × 2 = up to 36 images, generated lazily for combinations actually present). Full-colour
  artwork cannot use SDF `icon-color` tinting — that is a GL constraint.
- **Major encoding (preserves the "Bold outline = Major" channel):** Major pins use a double-weight halo
  (2 × `MAP_HALO_WIDTH` = 4 px) versus the standard 2 px halo — keeping the existing channel hint
  (`map-legend-channels` testid) truthful.
- **Level encoding:** `icon-size` graduated by level — level 1 = 0.75, level 2 = 0.875, level 3 = 1.0 (of the
  base pin box) — keeping "Bigger pin = higher level" truthful.
- Layer expressions: data-driven `icon-image` (`['concat', 'pin-', ['get','tone'], …]`), `icon-anchor:
  'bottom'` (tip exactly on the coordinate), `icon-overlap: 'always'`, `symbol-sort-key` = severity rank
  (HIGHER value renders on top **[verified]** — going > contained > … > neutral, +boost for major).
- Hover: `mousemove` + current-feature tracking (NOT `mouseenter` **[verified]**); pointer cursor. The hover
  tooltip is a single shared, `aria-hidden` floating element showing the same `pointLabel()` text (it
  duplicates information already available to AT via the mirror, so it is presentation-only); covered by a §9
  unit test.
- Click (when `linkable` and the point has an id): navigate to the incident, identical to today.
- Pulse: a paint-animated circle layer behind the capped "loud" set. The cap and predicate are the existing
  `pulseTargets()` logic from `marker-symbology.ts`, moved verbatim to `map-symbology.ts` with its tests. The
  animation loop is gated behind `prefers-reduced-motion` — our responsibility for custom animations
  **[verified]**.
- `map.addImage` registrations are guarded by `map.hasImage()` **[verified]**.

### 4.5 Terrain, hillshade & controls **[verified]**

- Two `raster-dem` sources (terrain + hillshade — the official quality pattern): AWS open terrarium tiles
  (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`), `encoding: 'terrarium'`
  (mandatory — the default `mapbox` encoding mis-decodes), `tileSize: 256`, `maxzoom: 13`. Accepted cost: two
  sources double DEM tile requests against the S3 origin — fine for a private demo (§10).
- `map.setTerrain({ source, exaggeration: 1.4 })`; hillshade is z-order 1 in the §4.2 table.
- DEM attribution (Joerd/Tilezen + USGS/NASA/NOAA) set on the sources' `attribution` field (licence
  requirement).
- **Controls** (all IControls, added once, persist across `setStyle` **[verified]**):
  `NavigationControl({ visualizePitch: true })`, `ScaleControl({ unit: 'metric' })` (preserves the metric
  scale bar contract), `AttributionControl` (§5.1).
- Both surfaces (overview and detail) default to **pitch 0** (north-up flat); tilt/rotate is user-driven.
  Rationale: pin hit-testing over pitched terrain has a known upstream accuracy issue **[verified]**; the a11y
  mirror is always a precise alternative path.

### 4.6 Camera

- Framing stays data-derived exactly as today (centres + polygon vertices + circle bounds), `padding: 24`,
  `maxZoom: 13`; framed once per mount (the latch in §3.3's points effect), never on live updates.
- Animations: `flyTo`/`fitBounds` with `freezeElevation: true`; **never** pass `essential: true` — MapLibre
  auto-skips animations under `prefers-reduced-motion` only when it is absent **[verified]**.
- Single-bare-pin view keeps `singleZoom` (default 11) semantics.

### 4.7 Live updates (explicit contract)

`points()` DOES change post-mount (overview live refresh, dev-user scope switching). On every change, the
points effect (§3.3):

1. rebuilds the GeoJSON FeatureCollection and calls `source.setData(...)`;
2. recomputes pulse targets and updates the pulse layer's filter;
3. lazily registers any newly-needed pin images (`hasImage` guard);
4. rebuilds the a11y mirror element list (diffed by feature id);
5. re-applies focus feature-state if the focused fire still exists (feature-state does not survive `setData`
   **[verified]**);
6. does NOT touch the camera (framed-once latch) and does NOT re-register existing images.

### 4.8 Requirement crosswalk (tracker IDs → GL mechanism)

These tracker rows are already `[x]` DONE; this table maps each user-visible behaviour to its new GL mechanism
so the migration preserves behaviour (it does not re-implement Leaflet fixes):

| Tracker ID  | User-visible behaviour             | GL mechanism                                            |
| ----------- | ---------------------------------- | ------------------------------------------------------- |
| MAP-1       | legend + metric scale bar          | legend (unchanged structure, §7 colours) + ScaleControl |
| MAP-3       | colour never sole signal           | glyph + label + size channels carried over              |
| MAP-6       | reduced-motion respected           | native camera skip + gated pulse/tooltip animations     |
| MAP-7       | attribution links styled/reachable | AttributionControl + §5.1 (restyled for GL classes)     |
| MAP-8       | map container border/radius tokens | host element CSS unchanged                              |
| MAP-9       | fitBounds zoom cap                 | `maxZoom: 13` on fit options                            |
| FIRE-AREA-5 | polygon → circle → pin fallback    | §4.2 layers, per-feature `kind`                         |
| FIRE-AREA-6 | extent kind in text channel        | `pointLabel()` unchanged (mirror + fallback list)       |

## 5. Basemaps & theme switching

### 5.1 Style URLs and attribution **[verified]**

- Light: `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json`
- Dark: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`
- Style URLs use the canonical `basemaps.cartocdn.com` host (per the repo `maplibre-gl` skill, map-setup.md);
  the style's own vector tiles, sprite and glyphs then load from `tiles.basemaps.cartocdn.com` — both hosts must
  be reachable, and both must be allowed if a Content-Security-Policy is ever added.
- **Mandatory attribution** (licence + quality bar): the AttributionControl must surface
  "© OpenStreetMap contributors © CARTO" (carried in the carto.streets tiles.json — never disabled or
  overridden away) plus OpenMapTiles and the DEM credits. It must be keyboard-reachable and meet AA contrast in
  both themes (restyling the existing attribution treatment from `.leaflet-control-attribution` to MapLibre's
  `.maplibregl-ctrl-attrib` classes).

### 5.2 Theme switching **[verified]**

Theme signal effect (debounced, idempotent) → `map.setStyle(nextStyleUrl, { transformStyle })`. Per swap,
explicitly:

| State                                   | Carried by `transformStyle` | Re-applied imperatively on `style.load` |
| --------------------------------------- | --------------------------- | --------------------------------------- |
| GeoJSON source + data layers            | yes                         |                                         |
| raster-dem sources + hillshade layer    | yes                         |                                         |
| terrain (`setTerrain`)                  |                             | yes (runtime call, not style JSON)      |
| pin images (`addImage`)                 |                             | yes (+ `styleimagemissing` safety net)  |
| focus feature-state                     |                             | yes (re-applied by the a11y layer)      |
| controls (Navigation/Scale/Attribution) | no — IControls persist      | never re-added (would duplicate)        |
| label-sandwich `beforeId` anchor        |                             | yes — re-derived from the NEW style     |

Voyager ↔ Dark Matter is always a full style rebuild (different sprite/glyph URLs) — the swap is written for
that worst case. A §9 test asserts terrain + pins + layer order survive a swap.

## 6. Accessibility (`map-a11y.ts`)

The GL canvas renders fires as pixels — invisible to assistive technology. The accessibility companion is a
permanent, first-class part of the architecture (the pattern of Mapbox's official accessibility plugin and
government WebGL guidance **[verified]**):

- **DOM mirror:** for each rendered fire, a transparent focusable element (≥ 24×24 px — WCAG 2.5.8) positioned
  over the canvas at the fire's projected location, `role="link"`, `aria-label` = the existing `pointLabel()`
  text, Enter → navigate. Mirror positions update on map `move`/`render` with batched reads/writes; only
  viewport-visible fires are mirrored (the overview's many-fires case).
- **Visible focus on canvas:** focusing a mirror element calls `setFeatureState({ focus: true })`; the
  `fire-focus-ring` layer draws the indicator. Focus colour is a per-theme token (`--color-map-focus-light` /
  `--color-map-focus-dark`); per research guidance a single fixed colour is unlikely to clear 3:1 on both
  basemaps, so per-theme values are required, and their ratios are **not yet measured** — measuring and
  enforcing them in `map-palette-contrast.spec.ts` is part of the implementation's definition of done.
- **Announcements:** one polite `aria-live` region; announces only deliberate focus/selection, never map moves.
- **WCAG 2.5.7 (dragging):** non-drag alternatives = NavigationControl zoom buttons + canvas arrow-key panning
  (MapLibre keyboard handler, on by default) + mirror-driven "jump to fire".
- **Canvas semantics:** MapLibre sets `role="region"` + `aria-label` on the canvas **[verified]**; the
  component adds visually-hidden usage instructions for screen-reader users.
- The legend structure, SVG fallback structure, fallback list and coordinate readout remain — but their
  **colours** move to the map palette (§7); their markup, testids and text channels are unchanged.

## 7. Map colour system

Research correction **[verified]**: there is no official Victorian incident-status colour spec. The Australian
Warning System colours encode *warning levels*, not incident statuses, and AWS yellow measurably fails WCAG
1.4.11 on a light basemap (1.16:1). The actual sector convention (SA CFS live site, AFAC doctrine): Going =
red, **Safe = blue**, Resolved = grey.

### 7.1 The palette

Verified ≥ 3:1 against the **primary land backgrounds** of Voyager (`#fafaf8`) and Dark Matter (`#0e0e0e`);
over mid-grey map surfaces (water/roads/parks) it is the mandatory halo — not the fill — that carries 1.4.11
**[verified]**:

| Status (= `StatusTone`) | Hex       | vs Voyager land | vs Dark Matter land |
| ----------------------- | --------- | --------------- | ------------------- |
| going                   | `#DA2D2D` | 4.57:1          | 4.04:1              |
| contained               | `#E8590C` | 3.43:1          | 5.39:1              |
| controlled              | `#B36A00` | 4.04:1          | 4.58:1              |
| safe                    | `#1F78C4` | 4.42:1          | 4.18:1              |
| neutral (resolved)      | `#6B7785` | 4.37:1          | 4.23:1              |
| missing                 | `#8E5BD0` | 4.41:1          | 4.19:1              |

### 7.2 Single source of truth (lint-compliant)

- ALL map colours are defined **once**, as plain-hex tokens in `tailwind.css` `@theme` (per
  styling-conventions, where colour tokens live): `--color-map-status-going` … `-missing`,
  `--color-map-halo-light`, `--color-map-halo-dark`, `--color-map-focus-light`, `--color-map-focus-dark`.
  Plain hex deliberately — NOT `light-dark()` pairs — because the status hexes are theme-invariant and
  theme-variant values (halo, focus) are expressed as explicit per-theme token pairs.
- **DOM consumers** (legend swatches, SVG fallback fills) use `var(--color-map-…)` — no hex outside the token
  definitions.
- **GL consumers** (`map-style.ts` paint expressions) read the tokens at runtime via `getComputedStyle` — which
  resolves plain-hex custom properties correctly (the review established it cannot resolve `light-dark()`,
  which is exactly why these tokens are plain hex with explicit per-theme pairs).
- **deck.gl (Campaign 2)** reads the same tokens through the same accessor + a `hexToRgba` helper.
- The §7.1 contrast table is enforced by **`map-palette-contrast.spec.ts`** — a NEW test with a hex parser
  (the existing `rose-pine-contrast.spec.ts` parses only `hsl()` and is not extended; its luminance/ratio maths
  is reused). The basemap land hexes live in this spec file as test constants.

### 7.3 Halo & application rules

- **Mandatory pin halo** **[verified]**: every pin carries a `MAP_HALO_WIDTH = 2` px stroke —
  `--color-map-halo-light` (`#0b0b0c`) on light theme, `--color-map-halo-dark` (`#f5f5f5`) on dark (11–19:1
  against all basemap surfaces). Major pins double it (§4.4). The halo is generated by `map-symbology.ts` and
  asserted by tests — it is what guarantees 1.4.11 over mid-grey surfaces.
- Polygon fills stay at 0.35 opacity; polygon **outlines** are full-opacity status colour.
- **One palette for everything map-related**: the GL layers, the pin images, the legend swatches AND the SVG
  fallback all read the same `--color-map-*` tokens, so a fire renders identical colours with and without
  WebGL. (`tone-classes.ts` and the fallback's fill rules are re-pointed accordingly — §3.2.)
- Rosé Pine remains untouched for all app chrome. The map legend describes the map, so it keys the map palette.
- CVD doctrine carried over: colour is never the sole signal — glyph + label + size channels remain.

## 8. Error handling & fallback

- The memoised `import('maplibre-gl')` is wrapped in `ResultAsync.fromPromise(...)`; failure (chunk-load error)
  → `tilesFailed.set(true)` → the existing SVG fallback + text list. The `must-use-result` rule is satisfied —
  every Result is `match`ed.
- Style/DEM/tile load errors → map `error` event → `tilesFailed` (same semantics as today's `tileerror`).
- WebGL unavailable / Map construction throws → caught → `tilesFailed`.
- **Loading state:** between canvas mount and `style.load`, the host shows the existing surface-container
  background (no spinner — typical resolve is sub-second on a dev machine; the SVG fallback covers genuine
  failure). The map fades in on first `idle` event (reduced-motion: no fade).
- **Empty state:** unchanged — `points()` empty renders the existing `role="status"` empty panel; no map, no
  mirror, no legend (exactly today's behaviour).
- Style-swap failures are caught (defensive `try`/`catch` around `setStyle` — the diff algorithm can throw
  **[verified]**); the map keeps the previous style.
- Synchronous GL event callbacks (which cannot return Results) guard-and-signal; navigation errors on pin click
  remain non-actionable no-ops.
- The SVG-fallback projection logic (`projected()`, `projectRing`, perimeter lat/lng extraction,
  `fallbackRingRadius`, the `SVG_*` constants) moves to `map-geometry.ts` as pure functions; its existing tests
  carry over to `map-geometry.spec.ts`.

## 9. Testing

### 9.1 Carry-over table (honest accounting)

| Existing `incident-map.spec.ts` block               | Fate                                                            |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Legend content/order, channel hints                 | Carried over (colour expectations updated to map tokens)        |
| Aria-label text (`pointLabel` composition)          | Carried over verbatim                                           |
| Empty state (`map-empty` testid)                    | Carried over verbatim                                           |
| SVG fallback list/coords/extent-kind text           | Carried over verbatim                                           |
| Fallback projection maths                           | Moved to `map-geometry.spec.ts`                                 |
| `planted marker symbology` block (markerHtml/Class) | **Deleted** — asserts Leaflet divIcon DOM that no longer exists |
| `.fire-marker` role=link / Enter / pulse-class DOM  | **Replaced** by a11y-mirror tests (same behaviours, new DOM)    |
| `pulseTargets` cap/predicate tests                  | Moved to `map-symbology.spec.ts` coverage, logic verbatim       |

### 9.2 Mocking (corrected by review — there are no "Leaflet mocks" today)

The current tests avoid mounting a real map entirely (jsdom cannot render Leaflet/WebGL). The new tests instead
provide a real `vi.mock('maplibre-gl')` factory with enumerated doubles: `Map` (with
`on/off/addSource/getSource/addLayer/getLayer/setData/getStyle/addImage/hasImage/setTerrain/addControl/remove/`
`project/queryRenderedFeatures/setFeatureState/setStyle`), `NavigationControl`, `ScaleControl`,
`AttributionControl`. jsdom has no WebGL, so the real `Map` is never constructed. Reduced-motion via the
existing `matchMedia` stub; timers per testing-conventions (no `fakeAsync`).

### 9.3 New tests

Layer-order invariant (asserts exactly the §4.2 table); promoteId/feature-state wiring; ring-generation maths;
pin image registration (status × level × major, `hasImage` guards, halo widths); `symbol-sort-key` ordering and
`icon-size`-by-level; hover tooltip; theme-swap state survival (§5.2 table); palette contrast guard
(`map-palette-contrast.spec.ts`); a11y mirror (focus → feature-state, Enter → navigate, aria-labels, ≥24 px
targets, viewport culling); `ResultAsync` import-failure → fallback.

### 9.4 Browser verification (quality gate)

Overview + detail, light + dark, 1320/820/390, keyboard-only pass, reduced-motion pass, axe scan, **as both an
admin (statewide, ~13 polygons) and a district-scoped viewer (e.g. Otway)** — matching the established quality
bar and the FIRE-AREA-7 protocol.

## 10. Risks & mitigations

| Risk                                                    | Mitigation                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| maplibre-gl v6 lands mid-campaign                       | Pinned to ^5.24.0; v6 migration explicitly out of scope          |
| Pin icons missing after theme swap                      | `style.load` re-registration + `styleimagemissing` net + test    |
| Hit-testing drift over pitched terrain (upstream issue) | Default pitch 0; a11y mirror as precise path                     |
| DOM mirror performance with many fires                  | Viewport culling; batched DOM writes                             |
| CARTO style restructure breaks first-symbol heuristic   | Runtime guard + fallback to top-of-stack insertion               |
| Doubled DEM tile requests (two sources)                 | Accepted for a private demo; CDN/single-source if it degrades    |
| Lazy-chunk growth invisible to `initial` budget         | Contained by dynamic-import architecture (no budget gate exists) |

## 11. Implementation sequencing (for the plan)

Executed as small, independently-verifiable milestones — each with green `check:ci` + tests before the next
(per the campaign's hard-won context-window lessons):

1. **Engine bootstrap** — dependency swap, `map-engine.ts` + dynamic import + fallback wiring; bare basemap
   renders on both surfaces; Leaflet still present but unused by the component.
2. **Geometry + symbology** — `map-geometry.ts`, `map-symbology.ts`, source + layers 1–5, label sandwich.
3. **Colour system** — `--color-map-*` tokens, palette accessor, legend/fallback re-pointing, contrast spec.
4. **Terrain + camera + controls** — DEM sources, hillshade, ScaleControl, framing, fly-to.
5. **Theme switching** — `transformStyle` swap + state re-application + tests.
6. **A11y mirror** — `map-a11y.ts`, focus ring layer, announcements, WCAG checks.
7. **Leaflet removal + cleanup** — dependency, styles.scss purge, `tone-classes.ts` pruning, dead code.
8. **Full QA** — §9.4 browser matrix, axe, `just ci`.

## 12. Campaign 2 forward-compatibility **[verified]**

The deck.gl analytics page (separate spec) will interleave deck.gl ≥ 9.1 layers onto a MapLibre v5 map via
`MapboxOverlay({ interleaved: true })`. This design keeps that path open: maplibre-gl ≥ 5 (WebGL2), stable layer
ids for `beforeId` anchoring, the palette readable from the same tokens (+ `hexToRgba` helper), and terrain kept
toggleable (deck.gl 3D layers do not drape on terrain — the analytics page will run terrain off).

## 13. Out of scope

- The deck.gl analytics page, scope dropdowns, season scrubber, CARTOColors ramps (Campaign 2).
- Self-hosting tiles / switching basemap provider (documented as the escape hatch in §2 if the demo is ever
  published; not built now).
- Any `libs/shared/domain` or `apps/api` change.
- maplibre-gl v6 adoption.
