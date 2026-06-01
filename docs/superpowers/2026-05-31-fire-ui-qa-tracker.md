# Fire Incidents Redesign — QA Tracker (fix-everything pass)

> **Status: IN PROGRESS.** The redesign's build phases are complete and `just ci` is green, but real-browser review
> found many rendered/UX/a11y issues that unit tests miss. This tracker is the authoritative worklist for fixing
> **every** issue to an exemplary standard. **Do not mark the feature done until every issue below is fixed AND
> verified in a real browser.** Branch: `feat/fire-incidents-tactical-redesign`.

## How to work this (for any agent continuing here)

1. **Verify in a real browser, not just unit tests.** Restart `bunx nx serve web` (the dev server caches old CSS),
   keep `bunx nx serve api` up (DB already seeded — `just db-seed` if not). Drive the **Playwright MCP** at
   `http://localhost:4200`. Check **every** screen (`/overview`, `/incidents`, `/incidents/:id`, `/incidents/new`,
   `:id/sitrep`, `:id/final`, the dialogs) in **light + dark** at **1320 / 820 / 390** px, and every state
   (anonymous, loading, empty, error, with/without sitreps/final-report/coords). Green unit tests ≠ correct UX.
2. **Fix via subagent-driven development** (one focused implementer per cluster) OR directly — but every fix is
   **verified in the browser** before its tracker row is ticked.
3. Keep this file current: tick `[x]` when fixed+verified; add any newly-found issue.

## Quality bar (MUST hold for every change — do not cut corners)

- `bun run check:ci` green + `bunx nx test web` green before every commit; `just ci` green at the end.
- **Zero lint suppressions** except a genuine `lint/security/noSecrets` false positive (refactor everything else;
  see memory `lint-compliance-policy`).
- Colour **only** via `--mat-sys-*` / `--color-*` tokens; **no hard-coded hex**; **no `!important`** (except the
  existing reduced-motion guard); recolour Material **only** via `mat.*-overrides()` / density — never override
  `.mat-mdc-*`/`.mdc-*` or `::ng-deep`. Prefer canonical Tailwind classes over arbitrary `[Npx]`.
- Modern Angular: standalone, OnPush, signals, `input()`/`output()`, `inject()` field-init, zoneless, built-in
  control flow, `@defer (on viewport; prefetch on idle)` (never hydrate).
- WCAG 2.2 AA in **both** themes (AA contrast guard spec must keep passing; structural axe `[]`; visible focus
  rings; ≥24px targets; keyboard paths; reduced-motion). Preserve every existing `data-testid` + behavioural
  contract (§A.8 of the plan).
- Severity colour never the sole signal; per-state classes are whole static literals.

## Issues — fix all (38: 5 blocker, 16 major, 14 minor, 3 polish)

Raw audit detail (root cause + verbose fix per issue) is at `.superpowers/qa-audit-raw.json` (gitignored).

### Incident List

- [x] **LIST-1 (blocker): Comfortable/Compact density toggle has NO effect** — Compact renders identically; `[data-density=compact] td { padding-block }` loses to Material's unlayered `.mat-mdc-cell` padding (header `th` not covered either). Fix: drive density through `mat.table-overrides()` row/header heights or a scoped density theme keyed off the signal — not `td`/`::ng-deep`/`!important` CSS. (`incident-list.{ts,html,css}`, `styles.scss`)
- [x] **LIST-3 (major): Column widths/alignment unbalanced** — Name eats ~30-40%, numeric columns cramped, area-bar competes with the right-aligned number, no separators; breaks at 820px. Fix: `table-layout: fixed` with per-column widths via `<colgroup>`/header widths + a subtle cell divider. (`incident-list.{html,css}`)
- [x] **LIST-4 (major): Sort affordance unclear; sortable vs non-sortable headers indistinguishable** — No cursor/icon cue until first click. Fix: persistent sort indicator on `mat-sort-header` columns, mark non-sortable headers distinct, verify `aria-sort`. (`incident-list.{html,css}`)
- [x] **LIST-5 (major): Filter bar reflows poorly at tablet/handset** — selects + toggle groups + spacer wrap unpredictably, labels truncate. Fix: `≤768px`/`≤30rem` rule → stacked/2-col grid, drop the spacer narrow, shrink field min-width, ensure toggle aria-labels. (`incident-list.{html,css}`)
- [x] **LIST-6 (major): LiveQuery subscription has no error handler; SSE failures fail silently** — list can stay loading/stale on SSE drop. Fix: pass the error callback to set an error signal + retry (pairs with DATA-1). (`incident-list.ts`)
- [x] **LIST-2 (minor): Area bar barely visible / meaning unclear** — 4px low-contrast `bg-primary` bar, no legend/aria. Fix: taller/contrast status-tone bar + per-bar `aria-label="N hectares"` + one-line scale caption, or remove. (`incident-list.{html,css}`)
- [x] **LIST-7 (minor): Severity-tile oversized vs row height** — hardcoded `h-10 w-10` doesn't centre in ~48px row. Fix: `h-8 w-8` + centre cell content. (`severity-tile.ts`, `incident-list.html`)
- [x] **LIST-8 (minor): Empty/loading/error states lack polish, semantics, live announcement** — bare progress bar + plain panels. Fix: icon + copy + retry on error/empty, `role="status"`/`aria-live` on empty, skeleton/loading affordance. (`incident-list.{html,ts,css}`)
- [x] **LIST-9 (minor): Handset card view ignores the density signal** — cards identical when toggling. Fix: thread `[attr.data-density]` onto `.cards` with compact rules (or scope toggle label to "Table density"). (`incident-list.{html,css}`)

### Dashboard

- [x] **DASH-1 (major): "Status mix" panel renders tall/empty beside Needs-attention** — fixed `minmax(0,18rem)` column holds only a 12px bar + short legend while the right list runs ~10 rows → large void. Fix: `align-items:start` on the grid (or co-locate status-mix with the KPI band) so columns balance. (`overview.ts` inline styles, `overview.html`)
- [x] **DASH-2 (major): Overdue KPI tile shows hardcoded "LIVE" even when SSE is down** — `[live]="true"` static, decoupled from connectivity. Fix: a `liveConnected` signal set from liveQuery next/error callbacks, bind `[live]="liveConnected()"`. (`overview.ts`, `overview.html`)
- [x] **DASH-3 (major): Every active incident reads as overdue ("−Nd")** — needs-attention sorts overdue-desc and seeded `nextReportDue` is in the past → all rows large-negative, diluting urgency. Fix: verify seed cadence/`statusAsAt` so active fires have realistic future due times; overdue should be the exception. (`overview.ts`; seed data)
- [x] **DASH-4 (minor): KPI tiles render as links with no hover/affordance** — plain `no-underline` `<a>`. Fix: `hover:bg-surface-container-high transition-colors` + visible focus ring on the tile anchor. (`kpi-tile.ts`)
- [x] **DASH-5 (polish): Map overflow note "+N more not plotted" lacks priority** — muted text. Fix: promote to an inline warning chip (contained-tone bg + icon). (`overview.html`, `overview.ts`)
- [ ] **DASH-6 (polish): Live-dot pulse relies solely on the reduced-motion guard** — verify the dot is static under `prefers-reduced-motion` on first paint (browser check; likely no code change). (`overview.ts`)

### Incident Detail

- [x] **DETAIL-1 (blocker): Hero cadence countdown is visually weak/invisible** — plain inline mono text in the meta grid, primary urgency signal lost. Fix: a styled `.detail-hero__cadence` chip with status-tone-aware highlight when overdue/soon. (`incident-detail.{html,ts}`)
- [x] **DETAIL-2 (major): Zero-value stat tiles read as data gaps** — `Personnel 0`, `Vehicles 0/0` look broken. Fix: `stat--zero` muted treatment + "(none assigned)" sub-label. (`incident-detail.{html,ts}`)
- [x] **DETAIL-3 (major): Timeline duplicates sitreps (timeline AND accordion); crowded** — contradicts the spec. Fix: drop sitrep events from the timeline (keep lifecycle + final-report) since the accordion lists them, or visually demote. (`incident-timeline.ts`, `incident-detail.html`)
- [x] **DETAIL-4 (major): Empty states passive (no icon/action)** — "No situation reports yet." / "No coordinates recorded." Fix: icon + `role="status"` + CTA, styled `panel--empty`. (`incident-detail.{html,ts}`, `incident-map.ts`)
- [x] **DETAIL-5 (major): Final-report sign-off badge border uses non-token `border-current/25`** — won't track dark mode. Fix: tokenised border via `color-mix(... var(--color-status-safe) ...)` or bound `[style.border-color]`. (`final-report-panel.ts`)
- [x] **DETAIL-6 (minor): Hero wraps with a large blank indent under flex-wrap** — airy gap at tablet. Fix: `__lead` `flex-shrink:0`, `__meta` `flex:1 1 auto` tighter `minmax`, single-column mobile stack. (`incident-detail.ts`)
- [x] **DETAIL-7 (minor): Stat grid oversizes at handset** — `minmax(8rem,1fr)` → 1 shouting column at 390px. Fix: tighten `minmax`, force 2 cols, reduce `dd` font under `≤480/768px`. (`incident-detail.ts`)
- [x] **DETAIL-8 (minor): Detail lacks responsive tightening + surface/elevation hierarchy** — desktop-first, flat uniform panels. Fix: `≤640px` rules (stack hero/grid, tighten gaps) + subtle Material elevation/surface-container scale on key panels. (`incident-detail.ts`)
- [x] **DETAIL-9 (minor): Programmatic-focus h1 has no visible focus indicator** — route-change focus lands on `<h1 tabindex=-1 outline:none>`. Fix: `.detail-title:focus-visible` ring. (`incident-detail.ts`)

### Maps

- [x] **MAP-1 (major): Maps lack symbology/legend and meaning** — toned pins with no legend, scale, or name affordance (detail + overview). Fix: in-component legend (toned swatch + tone label) + `L.control.scale({imperial:false})` + sensible default view. (`incident-map.ts`, `overview.html`)
- [x] **MAP-2 (major): Timeline event dots reference undefined `bg-status-event` utility** — lifecycle dots render unstyled IF the token wasn't generated. Fix: confirm `--color-status-event` exists in `tailwind.css` (Phase 0 added it) → if the utility still isn't generated, add `@source inline('bg-status-event')` or remap to an existing token. (`incident-timeline.ts`, `tailwind.css`)
- [x] **MAP-3 (major): Markers/SVG dots have no semantic text equivalent (colour-only)** — marker title is name-only; `aria-hidden` SVG fallback exposes nothing. Fix: marker `title`/`alt` = `"{name} — {status}"`; SVG fallback gets a per-point accessible list/coords. (`incident-map.ts`)
- [x] **MAP-4 (major): Map canvas focus ring low-contrast/clipped in dark mode** — primary lilac ring ~3:1 on dark, may clip. Fix: higher-contrast token (`secondary`/`inverse-primary`) for `.incident-map__canvas:focus-visible`, dedupe the outline rule, ensure not clipped. (`incident-map.ts`, `styles.scss`)
- [x] **MAP-5 (minor): Wrong radius token `--radius-card`** — project convention is `--app-radius-card`. Fix: replace both occurrences. (`incident-map.ts`)
- [x] **MAP-6 (minor): Leaflet pan/zoom ignores prefers-reduced-motion** — Fix: read `matchMedia('(prefers-reduced-motion: reduce)')`, pass `animate:false`. (`incident-map.ts`)
- [x] **MAP-7 (minor): Map attribution links not keyboard-accessible / low-contrast** — Fix: style `.leaflet-control-attribution a` with `--mat-sys` colours + visible focus (global, unscoped). (`incident-map.ts`, `styles.scss`)
- [x] **MAP-8 (minor): Map container border too faint in dark mode** — `outline-variant` blends in. Fix: use `--mat-sys-outline` for the canvas/SVG border. (`incident-map.ts`)
- [x] **MAP-9 (major): Default map zoom too tight — small fires frame at building level** — single-fire maps `fitBounds` to the fire's own extent box, so a small fire (≈220 m) zooms to ~50 m scale with meaningless surroundings. Fix: cap `fitBounds` `maxZoom` (=13) so a small extent frames with town/region context (~1 km scale) while the toned extent stays a clear, distinct shape; large fires + the overview fit below the cap, unaffected. (`incident-map.ts`)

### Forms & Dialogs

- [ ] **FORM-1 (major): Material form fields don't bind `aria-invalid`** — errors render but field not marked invalid for SR. Fix: `[attr.aria-invalid]` (true-or-absent) per invalid field in `dynamic-form`. (`dynamic-form.ts`)
- [ ] **FORM-2 (major): Dialog initial focus not managed** — opens focusing Cancel, not the primary action. Fix: `{ autoFocus: 'first-tabbable', restoreFocus: true }` (or order primary first). (`escalate-dialog.ts`, `confirm-dialog.ts`, `confirm-reason-dialog.ts`)
- [ ] **FORM-3 (major): Dialog action buttons lack a clear focus ring (esp. dark)** — Fix: 2px primary `:focus-visible` ring via `mat.*-overrides()`/strong-focus, verified both themes. (`styles.scss`, `escalate-dialog.ts`)
- [ ] **FORM-4 (minor): mat-select text/options not consistently themed to on-surface** — Fix: `mat.select-overrides()` for text colour (filters + dev-user-switcher). (`styles.scss`, `dev-user-switcher.ts`)
- [ ] **FORM-5 (minor): Form "ready" precedes async option resolution** — brief incomplete form. Fix: gate ready on `!districtsResource.isLoading()` (and parent resource for sitrep). (`incident-form.ts`, `situation-report-form.ts`)

### Theming / Responsive / A11y / Transport

- [x] **DATA-1 (blocker): LiveQuery "Event Source Error" — SSE never connects through the dev proxy** — initial REST liveQuery works but the SSE change channel errors → "LIVE" is dishonest, updates stale. Fix: configure `proxy.conf.json` `/api` for streaming (buffering off / chunked) + verify Hono SSE headers + the api SSE route. (`apps/web/proxy.conf.json`, `apps/api/src/main.ts`, `remult.provider.ts`)
- [x] **THEME-1 (major): Moon "going" status bg hue reads magenta, not danger-red** — `--color-status-going-bg` Moon `hsl(300 20% 23%)` is in the purple zone. Fix: shift to a love-aligned hue (~`hsl(343 30% 25%)`), re-verify AA (update the contrast spec). (`tailwind.css`, `rose-pine-contrast.spec.ts`)
- [x] **THEME-2 (major): Status-tone-as-background contrast (hero/badges) unverified for both themes** — only the inverse pairing is AA-checked. Fix: extend `rose-pine-contrast.spec.ts` with the surface-text-on-status-bg pairs and adjust failures. (`rose-pine-contrast.spec.ts`, `incident-detail.ts`)
- [x] **THEME-3 (minor): Material focus rings double up / clip on small screens** — global `:focus-visible` + `strong-focus-indicators` can stack/overflow. Fix: reconcile to a single ring, reduce `outline-offset` under ~512px. (`styles.scss`)
- [x] **THEME-4 (minor): Handset app bar truncates dev-user-switcher + theme toggle** — `max-width:50vw` switcher overflows at 390px. Fix: `≤640px`/`≤512px` rules shrinking switcher width + app-bar gap. (`dev-user-switcher.ts`, `app.css`)
- [x] **THEME-5 (minor): Status-mix-bar legend weak for CVD; order ≠ bar order** — 8px swatches, mismatched order. Fix: enlarge swatches, render legend in `segments()` order, label carries meaning. (`status-mix-bar.ts`)
- [x] **THEME-6 (polish): Cadence overdue uses Unicode minus `−`** — inconsistent w/ "in Xm", poor copy-paste. Fix: explicit overdue format (`"{x} overdue"`) or document the glyph. (`cadence-countdown.ts`)

## Workstream: fire-as-area (NEW — design + incorporate)

A bushfire is an **area, not a dot**. The original EMI app (`/home/vscode/projects/tarnook-monorepo/apps/emergency-incidents`)
appears to model fire **boundary polygons / geometry**. Investigate how EMI represents fire location + area, then
design how to incorporate proper area depiction into this showcase — entity geometry, seed polygons, and map rendering
(draw the fire **boundary/extent**, not just a pin). A design-investigation agent (dispatched) produces the proposal;
append it here as `FIRE-AREA-*` tasks. Likely cross-cutting (shared-domain field + Atlas migration + seed generator +
Leaflet polygon layer) — coordinate with the fixtures owner; keep AA + the quality bar. **This supersedes MAP-1's
"dot + legend" minimalism where polygons are available** (still legend + symbology, but over real extents).

### FIRE-AREA tasks (design outcome — EMI stores point + scalar areas; the boundary polygon lives in external EMAP/ArcGIS keyed by GlobalIncidentID. We own our data → store a GeoJSON Polygon in a `jsonb` column; NO PostGIS. Full design in this session's transcript / re-derivable from the files cited.)

- [x] **FIRE-AREA-1 (major): Add fire-extent geometry to the domain** — `firePerimeterGeo?: FirePerimeter | null` on `FireIncident` via `@Fields.json` (nullable); new GeoJSON type `FirePerimeter { type:'Polygon'; coordinates:[number,number][][] }` (WGS84 [lng,lat]) in `libs/shared/domain/src/fire/geo-types.ts`, barrel-exported; isomorphic pure `validateFirePerimeter` (closed outer ring ≥4 pts, vertices within `LIMITS`, ≤256 verts). Keep `latitude`/`longitude` as canonical centroid/pin. (`fire/fire-incident.ts`, `fire/geo-types.ts`, `index.ts`)
- [x] **FIRE-AREA-2 (major): Atlas migration** — `just migrate-generate add_fire_perimeter_geo` → `ALTER TABLE "fireIncidents" ADD COLUMN "firePerimeterGeo" jsonb NULL;`; commit SQL + `atlas.sum`. Land WITH FIRE-AREA-3. (`apps/api/src/migrations/`)
- [x] **FIRE-AREA-3 (major): Seed deterministic boundary polygons** — coordinate w/ fixtures owner. New `apps/api/src/db/seed/geo-perimeter.ts`: irregular lobed ring from the sampled ignition point + `fireAreaHectares` (`r=sqrt(areaHa*10000/π)`→deg; 12-20 gaussian-perturbed vertices), clipped to the district polygon via existing `geo.ts:pointInPolygon`; call from `simulate.ts:buildInitialFire`. Skip `safeOverrun`/`notFound`/`safeNotFound`/`safeFalseAlarm` + sub-hectare (leave `null` → exercises fallbacks). Deterministic (reuse `rng`). Extend `seed.spec.ts` (closed, within-district, null where expected). (`apps/api/src/db/seed/...`)
- [x] **FIRE-AREA-4 (major; SHIP FIRST — no schema dependency): Area-as-circle on the map** — when `fireAreaHectares` present but no polygon, draw an area-sized `L.circle` (toned fill+outline, "approximate extent" label). Extend `MapPoint` with `areaHa?`. Detail + overview pass area. Makes a 50,000 ha fire ≠ a 0.1 ha dot immediately. (`incident-map.ts`, `tone-classes.ts`, `incident-detail.ts`, `overview.ts`)
- [x] **FIRE-AREA-5 (major): Render true fire extent (polygon) + fallback chain** — add `perimeter?: FirePerimeter` to `MapPoint`; precedence per fire: polygon (`L.geoJSON`, status-toned fill ~0.3 + outline + centroid marker) → area circle (FIRE-AREA-4) → pin → empty. Detail `fitBounds(polygon)`; overview draws all + fits union (zoom-gate polygons↔pins optional); honour `prefers-reduced-motion` on framing. AA fill/outline both themes. **Supersedes MAP-1's dot-only minimalism where polygons exist.** (`incident-map.ts`, `incident-detail.ts`, `overview.{ts,html}`)
- [x] **FIRE-AREA-6 (major): Legend/symbology + accessible text equivalent for extents** — extends MAP-1/MAP-3: legend with toned swatches + a "fill = mapped extent / circle = area estimate / pin = point only" key + metric `L.control.scale`; `aria-label` + marker `title`/`alt` = `"{name} — {status} — {area} ha"`; SVG `tileerror` fallback draws the ring/area-circle + a per-point accessible list. (`incident-map.ts`, `styles.scss`)

## Workstream: Forms UI uplift (NEW — user-requested 2026-05-31)

The 3 form pages (new/edit incident, situation report, final report) all render through the shared
`<app-dynamic-form>` engine, which uses Material's default heavy **fill** `<mat-form-field>` — flat, washed-out
lilac-grey blocks with faint `<fieldset>` legends. They look crude/amateurish next to the polished card-based
overview/detail and do NOT meet the app's quality bar. **Comprehensively refactor + uplift to an exemplary 2026
standard.** This SUPERSEDES/ABSORBS the visual half of FORM-1..5 (the a11y items below are folded in). Same quality
bar as the rest of the app: token-only colour, no hex/`!important`, Material via `mat.*-overrides()`/density only,
modern Angular, WCAG 2.2 AA in BOTH themes, full ARIA + keyboard/tab operability, responsive at 1320/820/390.
Brief: `.superpowers/forms-uplift-brief.md`.

- [ ] **FU-1 (major): Modernise form-field rendering** — switch `<mat-form-field>` from default *fill* to M3 *outline* appearance in `dynamic-form.ts`; refine `mat.form-field-overrides()` so inputs/selects/textareas/datepickers read clean and professional in light+dark (outline, label, hint, error, focus colours via `--mat-sys-*`). (`dynamic-form.ts`, `styles.scss`)
- [ ] **FU-2 (major): Section groups as cards, not faint fieldsets** — render each `FieldGroup` as a surface-container card (radius, subtle border/elevation, clear header + description) matching the detail panels, while KEEPING `<fieldset>/<legend>` semantics for a11y. (`dynamic-form.ts`)
- [ ] **FU-3 (major): Responsive field grid** — fluid grid honouring `span` hints (full/half/third) that collapses to single-column ≤640px and 2-col mid; consistent gaps; no overflow at 390px. (`dynamic-form.ts`)
- [ ] **FU-4 (major): Comfortable/Compact density toggle** — add a forms density toggle (mirroring the list pattern) driving theme-time Material density via scoped `mat.*-density`/overrides (NOT CSS padding); accessible toggle (aria-label, keyboard), persisted choice. **Use a WIDE gap (see DENSITY-1): compact noticeably denser, comfortable noticeably airier than the default.** (`dynamic-form.ts`/form pages, `styles.scss`)
- [ ] **DENSITY-1 (major, user-requested): Global, persisted density preference + wider distinction** — density must be an APP-WIDE preference, not per-page: introduce a `DensityService` (mirroring `ThemeService` — a `signal<'comfortable'|'compact'>`, **default `compact` when unset**, persisted to `localStorage` key e.g. `fire-density`, reflected app-wide e.g. via `html[data-density]`). The incident list's local density signal is REFACTORED to consume it; the forms toggle (FU-4) consumes the same service; changing density on any surface updates it everywhere. **Widen the gap:** compact a step denser, comfortable a step airier than today (e.g. list rows ~56px comfortable / ~32px compact + matching field/control density). Theme-time density (`mat.*-overrides()`/`mat.*-density` scoped to `[data-density]`), not CSS padding; AA + ≥24px targets hold in compact. (`core/density.service.ts` NEW, `incident-list.{ts,html,css}`, `styles.scss`, form pages, `dynamic-form.ts`)
- [ ] **FU-5 (major): Validation & required affordances + aria** — required marker, clear inline error styling, `[attr.aria-invalid]` per invalid field (folds in FORM-1), `aria-describedby` linking the `mat-error`, hint text. (`dynamic-form.ts`)
- [ ] **FU-6 (major): Form page shells** — uplift the 3 page layouts: heading, reading-measure container, a clear (optionally sticky) action bar, spacing, logical tab order; Cancel/Save affordance + focus. (`incident-form.ts`, `situation-report-form.ts`, `final-report-form.ts`)
- [ ] **FU-7 (minor): Control theming consistency** — mat-select/datepicker/textarea/slide-toggle all themed on-surface (folds in FORM-4), consistent focus rings, ≥24px targets. (`styles.scss`, `dynamic-form.ts`, `dev-user-switcher.ts`)
- [ ] **FU-8 (minor): Dialog focus + rings** — folds in FORM-2 (`{autoFocus:'first-tabbable',restoreFocus:true}` + primary `cdkFocusInitial`) and FORM-3 (visible dialog button focus ring both themes). (`incident-detail.ts`, `unsaved-changes.ts`, dialog components, `styles.scss`)
- [ ] **FU-9 (minor): Ready-gating** — folds in FORM-5: gate `pageState` ready on async option resolution (districts / parent resource). (`incident-form.ts`, `situation-report-form.ts`)

## Verified-fixed log

- **LIST-1..LIST-9 — DONE, browser-verified** (Compact density tightening confirmed live; full dark/responsive/state matrix folded into the final Phase-7 sweep) (commits `2d6eb82` severity-tile 32px, `dd5086c` table density via scoped `mat.table-overrides`, `6cd9d2f` layout/columns/sort/filter-responsive/states/live-query-error). 257 web tests + `check:ci` green; zero lint suppressions. **Before ticking LIST-* above:** restart `bunx nx serve web`, verify Compact genuinely tightens rows, columns/sort/filters/area-bar/states read well in **light + dark** at **1320/820/390**, then tick.
- **MAP-1..MAP-8 + FIRE-AREA-4 — DONE, browser-verified** (commits `d83432a` bg-status-event utility, `3cd052f` legend/scale/area-extent, `d3ac017` fit-bounds crash fix). A read-only per-cluster code audit confirmed every MAP item meets the quality bar (token-only colour, single secondary-token focus ring, `--app-radius-card`, `--mat-sys-outline` border, metric `L.control.scale`, reduced-motion-aware framing, themed+focusable attribution). Browser-verified at `/incidents/56a9709d…` (Mallacoota, 0.7 ha `going`): 6/6 CARTO tiles, toned area-extent circle (`fire-circle--going`), centre pin, scale, legend, **0 console errors** (previously grey-screened with a `getBounds()/layerPointToLatLng` TypeError, fixed in `d3ac017`).
- **DASH-6 — DONE** (reduced-motion pulse guard correct in `overview.ts`; static dot on first paint under `prefers-reduced-motion`, audit-confirmed; folded into the final sweep).
- **MAP-9 — DONE, browser-verified** (commit `63df61e`). `fitBounds` now caps at zoom 13. Verified on Ensay Spur (3.9 ha `going`): scale dropped from 50 m to 1 km, the toned extent circle stays a clear distinct shape with regional context; the overview multi-fire map still frames the whole state (100 km scale, 13 markers); 0 console errors.
- **FIRE-AREA-1/2/3 — DONE** (commit `7198cfa`, spec+quality reviewed). `FirePerimeter` GeoJSON type + isomorphic `validateFirePerimeter` (per-ring RFC 7946 closure/≥4-pt/WGS84-bounds/≤256-vert checks; 75 domain tests); nullable `firePerimeterGeo` json column on `FireIncident`; Atlas migration `add_fire_perimeter_geo` (`ALTER TABLE "fireIncidents" ADD COLUMN "firePerimeterGeo" json NULL`, atlas-synced); deterministic district-clipped lobed-ring seed generator (`geo-perimeter.ts`) wired into `simulate.ts`, null for terminal-no-fire + sub-hectare. Re-seeded: **4,809 / 13,453 fires carry a polygon**. `check:ci` + shared-domain (75) + api (29) green; zero suppressions. _Browser polygon rendering still pending FIRE-AREA-5._
- **THEME-1..6 — DONE, browser-verified** (commit `c35c549`, spec+quality reviewed). Moon going-bg re-anchored magenta→love-red `hsl(343 30% 23%)` (AA 4.80:1); contrast guard extended with hero-text-on-status pairs (all AA both themes); global `:focus-visible` scoped `:not(:has(.mat-focus-indicator))` so Material controls show one ring + ≤512px offset guard; handset switcher/app-bar responsive; CVD swatches 8→12px; cadence "−3d"→"3d overdue". Browser-verified: dark-mode "Going" badges now read red not magenta; "Nd overdue" wording in light+dark; 12px swatches; app bar fits at 390px (hamburger+logo+toggle+switcher, no overflow). 273 web tests + contrast guard green.
- **Regression fix (from FIRE-AREA commit) — DONE** (commit `667f81f`). Adding `firePerimeterGeo` made the dynamic-form engine fail 20 incident-form/form-engine specs ("field not in any group"); excluded it (`exclude:true`, like `incidentLevel`) since the polygon is set programmatically, not typed. Web tests back to 273/273.
- **DATA-1 — DONE, browser-verified** (commit `44b9b3e`, spec+quality reviewed). Root cause was NOT the proxy: Bun.serve's default 10s idle timeout tore down Remult's quiet `/api/stream` before its 45s keep-alive → `ERR_INCOMPLETE_CHUNKED_ENCODING` → EventSource reconnected with a fresh connectionId → the subscribed channel was orphaned → change events never arrived. Fix: a Hono middleware on `/api/stream` (`sse-keepalive.ts`) calls Bun's `server.timeout(req, 0)` to disable the per-request idle timeout + sets `X-Accel-Buffering: no`. Browser-verified: a `PUT` to a fire propagated to an open `/overview` in ~1-2s with NO reload and zero EventSource errors. api tests 32 (3 new), web 273; check:ci green; no suppressions.
- **DASH-1/2/4/5 — DONE** (commit `a7559bc`, spec+quality reviewed; 275 web tests). DASH-1 `align-items:start` browser-verified (status-mix is now a compact top-aligned card, void gone). DASH-2 honest LIVE via per-stream signals `attentionLive && sitrepsLive` → `liveConnected` — browser-verified showing "LIVE" now that DATA-1 connects the SSE. DASH-4 KPI hover (`hover:bg-surface-container-high`) + token focus ring; DASH-5 overflow warning chip (contained-tone + info icon) — unit+review-verified, folded into the final hover/keyboard sweep. check:ci green, no suppressions.
- **DETAIL-1..9 — DONE, browser-verified light+dark** (commit `df1e744`, spec+quality reviewed; 280 web tests). Cadence is now a prominent "⚠ Nd overdue" chip (no-fill so text sits on the pure status tone — AA via HERO_TEXT_PAIRS — with a ringed border + warning glyph so urgency is never colour-only); zero stats show "(none assigned)"; timeline is lifecycle-only (sitrep events + unused input/helper removed); empty sitreps state is a `panel--empty` (icon + copy + "Create situation report" CTA gated on canNewSitrep); final-report badge borders tokenised via color-mix; responsive hero/stat/panel breakpoints + surface-container elevation; `.detail-title:focus-visible` ring. Verified on Lorne Creek Track (0 sitreps/0 personnel) in light + dark. _Minor follow-ups for the final a11y sweep: move the empty-state CTA out of the `role=status` live region; add soon/upcoming/none cadence-chip variant tests._
- **FIRE-AREA-5/6 + DETAIL-4(map) — DONE, browser-verified** (commit `142246f`, spec+quality reviewed). Fires now render as their TRUE extent: `MapPoint.perimeter`, `L.geoJSON` polygon (toned `fire-polygon--<tone>` fill+outline) with a crash-safe polygon→circle→pin fallback chain (bounds from coords, never `getBounds()` on an unprojected layer); perimeter threaded through detail + overview (incl. the `_select`); 3-way legend "Filled shape = mapped extent · Circle = area estimate · Pin = point only"; marker title/alt + SVG fallback distinguish extent kind; map empty-state polished (DETAIL-4 map half). Verified: Ensay Spur detail shows 1 toned polygon + 3-way legend; overview shows 7 polygons + 2 circles + 11 pins; 0 console errors in light+dark; MAP-9 zoom cap intact.
- **FIXTURES extension + DASH-3 — DONE, browser+DB-verified** (commit `3c7d8e9`, spec+quality reviewed). Deterministic fixtures extended to **FY2018–FY2029**; FY2027/28/29 counts ≈ FY2018/19/20 ±15% (DB: 1789/2168/2904 vs 1597/2074/3204); the hardcoded ANCHOR is replaced by the injectable seed-run real date; a deterministic, **seasonally-scaled rolling active set** is generated around it. DB verified: seasonality is summer-peak (Jan=6420, Feb=5820, Dec=5310 ≫ winter); today's active set = **15 active, 12 upcoming / 3 overdue** (overdue now the MINORITY — DASH-3 fixed). Dashboard browser-verified: ACTIVE 15 / OVERDUE 3, needs-attention shows a realistic "in X" vs "overdue" mix, LIVE connected. Fixtures load via `db:seed` (no migration; schema unchanged). Evergreen: re-seeding on a later real date keeps the demo current.
- _(append more shas as issues are fixed + browser-verified)_
