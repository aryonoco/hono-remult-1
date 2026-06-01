# Markers, popups, controls, events

## Contents

- Approach B: GL symbol pins vs the DOM `Marker`
- `Popup`
- Built-in controls
- Gesture/interaction handlers
- The event surface (`map.on`, layer-scoped)
- `queryRenderedFeatures` vs `querySourceFeatures`
- The accessibility companion (WCAG 2.2 AA — mandatory)
- Leaflet → MapLibre interaction mapping

## Approach B: symbol pins, not DOM markers

For many data-driven, queryable status pins, use a **`symbol` layer** with `icon-image` — not the DOM
`Marker` class. Pins then live in the label sandwich, recolour via expressions, are hit-tested by layer-scoped
events, and interleave with deck.gl. Reserve `Marker` for a handful of one-off interactive HTML overlays
(a geocoder result, a draggable measure handle).

```ts
map.addLayer({
  id: 'incident-pins',
  type: 'symbol',
  source: 'incidents',
  layout: {
    'icon-image': ['concat', 'pin-', ['get', 'status']], // per-status sprite (re-added on style.load)
    'icon-size': ['match', ['get', 'level'], 3, 1.4, 2, 1.2, /* default level 1 */ 1.0],
    'icon-anchor': 'bottom',          // the tip lands on the coordinate (was MARKER_BOX_ANCHOR)
    'icon-allow-overlap': true,       // show every pin; collision detection hides them otherwise
    'symbol-sort-key': ['case', ['get', 'major'], 1000, ['coalesce', ['get', 'level'], 1]],
    'text-field': ['get', 'name'],    // colour-independent label
    'text-optional': true,
  },
  paint: {
    'icon-halo-color': '#0b0b0c', 'icon-halo-width': 1.5, // SDF only; the contrast halo (theme-aware)
  },
});
// Pin click → in-app navigation; cursor affordance on hover.
map.on('click', 'incident-pins', (e) => {
  const id = e.features?.[0]?.properties?.['id'];
  if (id) void router.navigate(['/incidents', id]);
});
map.on('mouseenter', 'incident-pins', () => (map.getCanvas().style.cursor = 'pointer'));
map.on('mouseleave', 'incident-pins', () => (map.getCanvas().style.cursor = ''));
```

`symbol-sort-key` + `symbol-z-order` replace Leaflet's `zIndexOffset`/`markerStackOffset` — with
`icon-allow-overlap: true` the **higher** sort key draws on top, so Major (1000) wins overlaps.
`icon-overlap` (`'always'|'cooperative'|'never'`) is the newer form of
`icon-allow-overlap` and wins if both are set. `map.remove()` disposes every listener — there is no per-pin
cleanup to track (unlike the Leaflet `markerCleanups[]`).

## Marker and Popup

- `Marker`: `new Marker({ color, draggable, anchor }).setLngLat([lng, lat]).addTo(map)`. A DOM element you can
  style/animate freely; pass `{ element }` for a custom node. `.on('dragend', …)` for drag.
- `Popup`: `new Popup({ closeButton, closeOnClick, maxWidth }).setLngLat([lng, lat]).setHTML(html).addTo(map)`
  — or `.setDOMContent(node)` to avoid string HTML. Open one from a symbol-layer click using
  `e.lngLat`/`e.features`. `marker.setPopup(popup)` binds a popup to a marker.

## Built-in controls

Add once with `map.addControl(control, position?)`; `ControlPosition` is `'top-left'|'top-right'|
'bottom-left'|'bottom-right'`. Controls are `IControl`s and **persist across `setStyle`** — do not re-add them.

| Control              | Notes                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| `NavigationControl`  | Zoom + compass; `{ visualizePitch: true }` shows the pitch.             |
| `ScaleControl`       | `{ unit: 'metric' }` (replaces Leaflet `L.control.scale`).              |
| `AttributionControl` | Add once; carries OSM + CARTO credit. `{ compact, customAttribution }`. |
| `FullscreenControl`  | `{ container }` to target a wrapper.                                    |
| `GeolocateControl`   | `{ trackUserLocation, positionOptions }`.                               |
| `TerrainControl`     | `{ source, exaggeration }` — toggles 3D terrain.                        |
| `GlobeControl`       | Toggles the globe projection (v5).                                      |
| `LogoControl`        | Attribution logo.                                                       |

A **custom control** implements `IControl` (`onAdd(map)` returns a DOM element, `onRemove()` cleans up).

## Gesture/interaction handlers

Each is a togglable handler on the map: `scrollZoom`, `boxZoom`, `dragPan`, `dragRotate`, `keyboard`,
`doubleClickZoom`, `touchZoomRotate`, `touchPitch`, `cooperativeGestures`. Enable/disable with
`map.scrollZoom.disable()` etc. `keyboard` is on by default (canvas pan/zoom with arrows/`+`/`-`).
`{ cooperativeGestures: true }` requires ctrl/⌘ to zoom (good for embedded maps). See `toggle-interactions`.

## The event surface

`map.on(type, listener)` for map-wide events; `map.on(type, layerId, listener)` for **layer-scoped** events —
the idiomatic way to handle pin/perimeter interaction (`e.features` is populated, hit-tested for you).

| Event                                                   | Carries / use                                             |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `load`                                                  | Style ready — do `addSource`/`addLayer` here.             |
| `style.load`                                            | Fires on load AND after every `setStyle` — re-add images. |
| `click`/`mousemove`/`mouseenter`/`mouseleave` + layerId | `MapMouseEvent`: `e.lngLat`, `e.point`, `e.features`.     |
| `idle`                                                  | Rendering settled (good for screenshots/tests).           |
| `error`                                                 | Tile/style/WebGL failure — drive the fallback signal.     |
| `styleimagemissing`                                     | Lazily generate a missing `icon-image`.                   |
| `data`/`sourcedata`/`styledata`                         | Lifecycle (e.g. wait for a source to finish loading).     |
| `move`/`moveend`/`zoom`/`pitch`/`rotate`                | Camera changes — sync the accessibility DOM-mirror here.  |

`map.on(...)` returns a `Subscription` in v5; capture it to `.unsubscribe()` if needed, but `map.remove()`
disposes everything. Events **do not chain** in v5.

## queryRenderedFeatures vs querySourceFeatures

| Method                                     | Returns                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `queryRenderedFeatures(point\|bbox, opts)` | Features **currently drawn** at a point/box (respects layers + filter).               |
| `querySourceFeatures(source, opts)`        | Loaded source features regardless of viewport/visibility; may duplicate across tiles. |

Prefer layer-scoped event handlers over manual querying for pin picking. **Caveat:** `queryRenderedFeatures`
accuracy degrades over pitched 3D terrain (open issue) — hit-test at low/zero pitch, and use
`map.queryTerrainElevation()` for ground height rather than trusting query coordinates when pitched.

## The accessibility companion (mandatory)

MapLibre gives the canvas `tabindex`, `role="region"`, an `aria-label`, and a `KeyboardHandler` — but
**nothing per feature**. GL features are canvas pixels: invisible to assistive tech and to AXE, with no native
per-feature focus on the roadmap. A DOM-mirror is therefore a **permanent part of the architecture**, not a
stopgap:

1. One transparent, **≥24×24 CSS px**, focusable `<button>` per fire, absolutely positioned over
   `map.getCanvasContainer()`.
2. Sync each button's position on `move`/`render` using `map.project([lng, lat])` → screen pixels.
3. Focus/activate a button → set the camera (`easeTo`, **without** `essential:true`) and drive a
   `feature-state` `focus` highlight layer (paint expression), and navigate on Enter/click (the `role="link"`
   semantics that the Leaflet pins used to carry on their DOM).
4. Announce the focused incident via an `aria-live="polite"` region (never combined with `role="alert"`).
5. Keep the non-map equivalent — the incident list and the SVG/tiles-failed fallback — as the accessible
   alternative; the current component already carries name+status+level+area `aria-label`s to preserve.

```ts
// Reposition the focusable overlay buttons each frame the camera moves.
map.on('move', () => {
  for (const { id, lngLat, el } of overlayButtons) {
    const p = map.project(lngLat);          // LngLat → {x, y} screen pixels
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }
});
```

## Leaflet → MapLibre interaction mapping

| Leaflet                                          | MapLibre GL JS                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `event.latlng`                                   | `event.lngLat` (and `[lng, lat]` order)                          |
| `L.marker(...).addTo(map)`                       | `symbol` layer (status pins) or `new Marker().setLngLat().addTo` |
| `L.popup().setLatLng().setContent().openOn(map)` | `new Popup().setLngLat().setHTML().addTo(map)`                   |
| `L.control.scale()`                              | `map.addControl(new ScaleControl({ unit: 'metric' }))`           |
| `marker.on('click') + keydown + role=link`       | `map.on('click', 'pins', …)` + the DOM-mirror for keyboard/role  |
| `layerGroup().clearLayers()` on update           | `source.setData(fc)` — no clear-and-redraw                       |
| `map.remove()` + manual marker cleanup           | `map.remove()` (disposes all listeners; no per-pin cleanup)      |
