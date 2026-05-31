# Fire Incidents UI Redesign — "Tactical Command" Design Spec

Date: 2026-05-31
Status: Approved direction; pending spec review → implementation plan
Scope: `apps/web` (the fire-incidents Angular feature) + the shared theme/token layer. No `libs/shared/domain` or `apps/api`
changes are required — the domain/seed work (commit `0aa9e01`) is complete; the UI **consumes** it. The DB is seeded
deterministically with ~13,453 fires across 16 DEECA districts (FY2018–FY2026), of which ~12 are active; author fields
are operator ids resolved via `operatorName()`; `District` exposes `regionId`/`regionName`/`roseName`/codes. The redesign
must therefore handle scale (server-paginated list), resolve author names, be terminal-status-aware (no cadence on closed
fires), and add FY-scoped season aggregates + a region rollup to the dashboard — see the implementation plan §A.11.
Visual reference: `apps/web/public/_mockups/redesign.html` (served at `http://localhost:4200/_mockups/redesign.html`;
gitignored). Earlier exploration of directions: `apps/web/public/_mockups/directions.html`.

---

## 1. Goal & approved direction

The current UI is correct and accessible but reads like a default Angular Material CRUD scaffold: a one-row table on an
empty canvas, urgency invisible, flat hierarchy, no overview, beautiful fonts under-used. First impressions matter for
the stack-comparison demo — the interface must look exemplary.

**Approved direction — "Tactical Command" (Direction C blended with Direction A):** a severity-forward operations
console. Direction C contributes severity heroes, cadence countdowns, the map, the lifecycle timeline and two-pane
focus; Direction A contributes the dense KPI instrument strip, status spines, and IBM Plex Mono "readouts". It is built
entirely within the existing Material M3 + Tailwind v4 token system.

**Locked decisions (from review):**

1. **Build the Tactical Command blend as-is.**
2. **Map:** a real slippy map (**Leaflet 1.9.4**) with **CARTO** theme-paired basemaps (positron=light, dark_matter=dark,
   no key) as the committed default, plus graceful degradation (see §7).
3. **Theme:** **system default, light *and* dark equally polished.** Do **not** change `ThemeService`'s default to
   dark; both themes must be exemplary.
4. **Landing:** the new **Operations overview/dashboard** is the default route.
5. **Palette:** **Rosé Pine** — **Dawn** (light) / **Moon** (dark), expressed in HSL `light-dark()` pairs, mapped
   semantically (going=love, contained=gold, controlled=foam, safe=pine, neutral=subtle, missing=iris; primary=iris,
   tertiary=rose, error=love) and AA-verified in both themes. Exact token values: see the implementation plan §A.4.

**Success criteria:** distinctive and impressive at first glance on any screen size; urgency legible in < 1s; WCAG-AA in
both themes; full keyboard navigation; zero new behavioural regressions (all existing `*.spec.ts` contracts preserved);
`just ci` green.

---

## 2. Design principles & visual system

The redesign is driven **from the token layer first**, never from per-component hex (styling-conventions.md).

- **Severity is the primary visual language.** Reuse the existing `statusTone()` (`libs/shared/domain/src/fire/ui.ts`)
  → `StatusTone` → `--color-status-*` `light-dark()` tokens (`apps/web/src/tailwind.css`). Status spines, severity
  tiles, map pins, timeline dots and KPI accents all draw from this single source. No parallel colour logic.
- **Instrument typography.** Lean into the loaded faces: Libre Franklin (display/headings), Public Sans (UI/body), IBM
  Plex Mono with `tabular-nums` for all data readouts (IDs, areas, counts, countdowns, coordinates, timestamps).
- **Density without clutter.** Tighter rhythm than the current scaffold (this is *not* a whitespace-heavy redesign);
  a Compact density toggle on the list for triage.
- **Layered hierarchy.** A clear focal point per screen (severity hero on detail; KPI strip + "needs attention" on the
  dashboard); flat outlined panels for secondary content.
- **Both themes, tuned per mode.** Dark = command-centre (deep slate surfaces, neon-ish severity tones). Light = crisp
  high-contrast operations (ink-on-paper, saturated severity tones). Driven by `color-scheme` + `light-dark()` under
  `html[data-theme]` via `ThemeService` — one token set, two resolutions.

### Token work (the true control surface)

All in `apps/web/src/tailwind.css` and `apps/web/src/styles.scss`, honouring the `@theme inline` vs plain `@theme`
split (constraint C2 below):

- Retune the M3 theme in the single `mat.theme()` call (palette/density) and add `mat.toolbar-overrides`,
  `mat.card-overrides`, `mat.button-overrides`, `mat.theme-overrides` (fed by `--mat-sys-*`) for the console chrome.
- Verify/extend the `--color-status-*` light/dark pairs remain AA in both themes; add any new role tokens (e.g. a
  timeline `event`/`overdue` tone) as static `light-dark()` literals in plain `@theme`, and any live-following colours
  as `var(--mat-sys-*)` bridges in `@theme inline`.
- Add new container/spacing/radii tokens as needed (e.g. a `--container-wide` already exists for the dashboard).
- New per-state class strings must be **whole static literals** mapped in `Readonly<Record<…>>` (the `TONE_CLASSES`
  pattern) — never interpolated.

---

## 3. Surfaces & scope

| Surface                        | Change                                                                                                       | Key files                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **App shell**                  | Restyle toolbar/sidenav/user-chip; add **Overview** nav item; Material-consistent dev-user-switcher          | `app.ts/.html/.css`                                                   |
| **Routing**                    | New lazy `/overview` as default landing; set `data.width` for wide surfaces                                  | `app.routes.ts`, `fire-incidents.routes.ts`                           |
| **Overview dashboard** *(new)* | KPI strip, needs-attention, status-mix, recent activity, district rollup (elevated only), district map       | new `features/overview/`                                              |
| **Incident list**              | Severity-forward rows + Compact density toggle; restyle table/cards                                          | `incident-list.ts/.html`                                              |
| **Incident detail**            | Severity hero, instrument stats, **map** (deferred), **lifecycle timeline**, restyle metrics/actions/sitreps | `incident-detail.ts/.html` + 2 new child components                   |
| **Final-report panel**         | Visual restyle only (Tailwind classes); keep input/output + testid contract                                  | `final-report-panel.ts`                                               |
| **Forms**                      | Restyle the metadata renderer + page chrome; **no structural change** to widget switch                       | `shared/forms/dynamic-form.ts`, `form-page.ts`                        |
| **Dialogs**                    | Light restyle via Material dialog theming; preserve data/result contracts                                    | `escalate-dialog.ts`, `confirm-dialog.ts`, `confirm-reason-dialog.ts` |
| **Shared primitives** *(new)*  | `kpi-tile`, `cadence-countdown`, `status-mix-bar`, severity tile/utilities                                   | new `shared/components/`                                              |

**Out of scope:** any `libs/shared/domain` schema/logic change; any `apps/api` change; Phase 5 "add a field" demo;
real authentication; new domains. The existing 9 list columns, sort keys, route ordering, permission model and
LiveQuery patterns are preserved.

---

## 4. New components (all standalone, OnPush, signals, `inject()` field-init)

Shared (`apps/web/src/app/shared/components/`):

- **`kpi-tile`** — `input` label, value (string/number), unit?, tone? (`StatusTone | 'accent' | 'neutral'`), delta?,
  optional `routerLink`. Renders mono value + accent spine; navigates as a real `<a>`/`<button>` when linked.
- **`cadence-countdown`** — `input` due `Date | null`, now `Date`. Computes overdue / soon / upcoming / none from
  `nextReportDue` vs now; mono output ("06m", "−06m overdue", "1h 40m", "—"); pairs colour with text + `aria` so colour
  is never the only signal.
- **`status-mix-bar`** — `input` a `Record<FireStatus, number>` (or tone counts); stacked proportional bar + legend,
  toned via `statusTone()`.
- **severity tile / spine utilities** — small literal class-map (`Readonly<Record<StatusTone, string>>`) reused by
  list rows, dashboard and timeline; extends the `status-badge.ts` pattern. `StatusBadgeComponent` itself is reused
  as-is for status pills.

Detail children (`features/fire-incidents/incident-detail/`):

- **`incident-timeline`** (`app-incident-timeline`) — eager. `input.required` fire; `input` sitreps, finalReport?,
  now (default `new Date()`, injectable for deterministic tests). `computed events()` builds a discriminated
  `TimelineEvent[]` (`kind: started|detected|reported|crewSent|crewArrived|declaredMajor|sitrep|signOff|nextDue`) from
  real fields in `TIMESTAMP_PAIRS` order, then sitreps ascending by `reportNumber`, then `signedOffAt`, then
  `nextReportDue` as a trailing future/overdue marker (omitted when null). Renders a semantic `<ol role="list">` with
  decorative `aria-hidden` rail/dots, real `<time datetime=ISO>`, labels from `FIRE_STATUS_LABELS` /
  `FIRE_DETECTION_METHOD_LABELS` (never raw enums), and `<app-status-badge>` for status events. Optional duration
  annotations (detection lag, response time) via `MS_PER_MINUTE/HOUR`.
- **`incident-map`** (`app-incident-map`) — deferred (`@defer (on viewport; prefetch on idle)`, mirroring the
  final-report panel). `input` latitude?, longitude?, locationDescription, name. `computed hasCoords` = `lat != null
  && long != null` (note: `!= null`, so 0,0 is valid). See §7 for the Leaflet implementation and fallbacks.

New feature folder (`apps/web/src/app/features/overview/`):

- **`overview.ts`** (`OverviewComponent`) — see §5.

---

## 5. Overview dashboard — data model & flow

No new backend. Everything derives from existing fields and Remult's API primitives, and role/district scoping is
**automatic** via `FireIncident.apiPrefilter` (admins/stateOfficers see all districts; editors/viewers see only their
own; anonymous → skip queries until `DevAuthService.currentUser()` is defined). Do **not** add a `districtId` filter —
that would double-filter.

- **Primary source:** one `FireIncident` LiveQuery of active (non-terminal) incidents:
  `repo.liveQuery({ where: { status: { '!=': [...TERMINAL_STATUSES] } }, include: { district: true }, orderBy: {
  statusAsAt: 'desc' } })`. Re-subscribe on user change keyed by user id; clean up in `DestroyRef.onDestroy` (copy the
  effect/`userKey`/unsubscribe pattern from `incident-list.ts`). Wrap calls in `ResultAsync.fromPromise`.
- **A ticking signal** (every 30–60s) feeds "now" so overdue counts and the needs-attention sort stay accurate without
  a server round-trip (LiveQuery alone won't re-emit on wall-clock change). Implemented as a signal, not a raw
  `setInterval` fighting zoneless CD; cleaned up on destroy.
- **KPI tiles** (computed from `info.items`): Active = `items.length`; Going = count `status === going`; Declared major
  = count `isMajor`; Overdue reports = count `nextReportDue != null && nextReportDue < now`; Total active fire area =
  Σ `fireAreaHectares ?? 0` (labelled "active" precisely, since terminal incidents are excluded). Overdue/major tiles
  carry an `aria-live="polite"` region so screen readers hear escalations.
- **Count-by-status / by-level** — pure client reduce → `status-mix-bar` (toned via `statusTone()`) and a level chip row
  (`INCIDENT_LEVEL_LABELS`).
- **Needs attention** — items that are overdue OR `going`, sorted: most-overdue first (`now − nextReportDue` desc), then
  going, then `LEVEL_ORDER[incidentLevel]` desc, then `isMajor`. Each row → `RouterLink` `/incidents/:id`; capped ~8
  with a "view all" link.
- **Recent activity** — second LiveQuery: `repo(SituationReport).liveQuery({ orderBy: { submittedAt: 'desc' }, limit: 8
  })` (readable by all roles, auto district-scoped). Rows link to `/incidents/:fireIncidentId`.
- **Per-district rollup** — **elevated only** (add `canViewDistrictRollup(user)` = `isElevated`, mirroring
  `shared/auth/permissions.ts`). Client reduce of the active items by `districtId` → {district, active, going, major,
  total ha}. **Hidden entirely** (not just empty) for single-district roles.
- **District map** — the dashboard's overview map plots all active incidents (Leaflet, same component family as detail).
- **Route:** `app.routes.ts` redirect `'' → 'overview'`; add `{ path: 'overview', loadComponent: … }`. Set
  `data.width: 'wide'`. Add an "Overview" nav item (e.g. `insights` icon) above "Incidents" in `app.html` with
  `routerLinkActive`. `/incidents` is unchanged.
- **Non-live stats** (optional, later): `repo.aggregate`/`repo.groupBy` respect `apiPrefilter` but are point-in-time;
  reserve for any all-time/season panel, never for the live KPIs.

---

## 6. Incident list & detail restyle (preserve behaviour)

**List** — severity-forward rows (severity tile + status spine + `<app-status-badge>` + `cadence-countdown` + area bar).
**Decision (to avoid breaking harness tests):** keep `MatTable` as the desktop substrate so `MatSort`, `MatPaginator`
and `MatTableHarness` specs keep working — restyle the rows/cells severity-forward and add a **Comfortable/Compact**
density toggle that adjusts row padding and which secondary columns are visible (Compact ≈ today's dense table). The
existing handset branch becomes the richer **severity card** view. **Preserve:** the LiveQuery effect + unsubscribe,
`district` client-sort, the 9 `displayedColumns` + sort keys (`name`/`fireNumber`/`statusAsAt`), the 5-state
`viewState` switch, `canCreate` gate, `aria-live` count, paginator binding, and all `data-testid`s.

**Detail** — a severity hero (status + level + cadence countdown), instrument stat tiles (area/personnel/aircraft/
vehicles), the map panel, the lifecycle timeline, restyled sitrep list and action bar. **Preserve:** the `resource()`
param-gating + `include` flags, every `can*` computed signal, all dialog wiring through `invoke()` (ResultAsync +
NotificationService + LiveAnnouncer + resource reload), the `@defer` final-report panel contract
(`data-testid=final-report-placeholder`), and the action `data-testid`s. Add `incident-timeline` (eager) and
`incident-map` (deferred) inside the existing `@if (fire(); as f)` block; add their imports to the component.

**Forms & dialogs** — restyle within `dynamic-form.ts` / `form-page.ts` and the dialog templates only. **Preserve:** the
`@switch(field.widget)` cases, `[formControl]` bindings, `SPAN_CLASS` literals (`col-12/6/4/3`), the container-query
12-col grid, `firstError()` mapping, the `form.events` `markForCheck` effect, `formDirty` live region, save/cancel
outputs, `data-testid`s, the `datetime-field` CVA + a11y plumbing, and dialog data/result shapes. Form-configs may
re-group/re-order fields but every included field must remain in exactly one group (`assertGroupsCoverIncluded` throws
otherwise).

---

## 7. Map implementation (Leaflet + OSM, with fallbacks)

Per the locked decision, build a real slippy map. The grounding flagged real risks (offline devcontainer, OSM tile
usage policy) — addressed by graceful degradation so the demo is never blank.

- **Dependency:** add `leaflet` + `@types/leaflet` to `apps/web` (`scope:web` permits it; not added to `libs/shared`).
  Import Leaflet CSS in the component/build. Bundle (~40KB gz) is acceptable behind `@defer`.
- **Component:** `incident-map` initialises the Leaflet map in `afterNextRender` (DOM-imperative, zoneless-safe),
  destroys it in `DestroyRef.onDestroy`. Marker = a CSS-styled `L.divIcon` toned by `statusTone()` (avoids Leaflet's
  default-icon asset-path issue and keeps theming token-driven). Dashboard variant plots all active incidents and fits
  bounds; detail variant centres on the single fix.
- **Tile provider:** a single swappable `TILE_URL` constant; OSM standard tiles as the dev/demo default **with required
  attribution control**. Documented caveat: OSM's tile policy is for light/dev use — production needs a proper provider
  (MapTiler/Stadia/self-hosted) via config/env. No key is committed.
- **Graceful degradation (3 states):** (a) **no coordinates** → empty state with `place`/`map_off` icon + "No
  coordinates recorded", falling back to `locationDescription`; (b) **tiles fail to load** (offline) → on Leaflet
  `tileerror`, swap to a self-contained inline **SVG coordinate plot** (grid + toned pin + mono lat/long) so the panel
  always renders something credible; (c) **coordinates present, tiles load** → the real map + a mono lat/long `dl` + an
  "Open in maps" external link (`target=_blank rel=noopener`, explicit `aria-label`).
- **A11y:** the map container has an accessible name; keyboard pan/zoom is enabled (Leaflet supports it) with a visible
  focus ring; all information conveyed by the map is also available as text (coords readout + location description), so
  the map is an enhancement, not the sole channel.
- **Testing:** Leaflet won't render tiles in jsdom — component specs cover `hasCoords` logic, the empty-state and the
  SVG-fallback path, and that construction doesn't throw; the live map is verified in a real browser via the Playwright
  MCP. Add any new identifiers to `project-words.txt` for cspell.

---

## 8. Compliance checklist (hard constraints — must all hold)

Styling (Tailwind v4 + Material M3):

- **C1** Keep the cascade layer order `@layer base, material, tailwind, utilities;` (declared once in `styles.scss`);
  `tailwind.css` loads after. Utilities win by layer order — never by `!important`.
- **C2** `@theme inline` for any token referencing a live `--mat-sys-*` var; plain `@theme` for static literals (fonts,
  `--color-status-*` `light-dark()`, containers, radii). Breakpoints always plain `@theme`.
- **C3** Never hard-code hex in component CSS/templates — colour lives only in the `@theme` token layer; consume
  `--mat-sys-*` / `--color-*` bridges (`bg-surface`, `text-on-surface`, `text-muted`, …).
- **C4** The only sanctioned `!important` is the existing `prefers-reduced-motion` view-transition guard. No `::ng-deep`,
  no specificity hacks, no overriding Material's unlayered component CSS — recolour Material via `mat.*-overrides()` /
  `mat.theme-overrides()` fed by `--mat-sys-*`.
- **C5** Material via directives only: `matButton="filled|outlined|tonal|elevated|text"`, `matIconButton` (always with
  `aria-label`). Never legacy `mat-raised-button` etc., never `[color]`.
- **C6** Dark mode stays `color-scheme` under `html[data-theme]` via `ThemeService` (default unchanged = system). No
  second `mat.theme()`, no `.dark` class toggle. For a Tailwind dark variant use
  `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`.
- **C7** Tailwind class strings are whole static literals (no `bg-status-${tone}`); per-state maps as
  `Readonly<Record<…>>`. Keep `@source '../../../libs/shared/domain/src'`.
- **C8** Custom utilities via `@utility`; `@reference 'tailwindcss';` before any `@apply` in component styles;
  `--alpha()`/`--spacing()` helpers; raw `[style]` values on `:root` in `@layer base`. System elevation tokens
  (`var(--mat-sys-level2)`) for shadows, not literal offsets.

Angular (v21, verified live):

- **C9** Standalone (never `standalone:true`), `ChangeDetectionStrategy.OnPush` everywhere, signals only
  (`signal`/`computed`/`linkedSignal`/`resource`; `effect` sparingly), `input()/output()/model()`, `inject()` in field
  initialisers (parameterless constructor), zoneless (keep `provideZonelessChangeDetection`).
- **C10** Control flow `@if/@for/@switch/@defer` only; `@for` needs stable `track`; `@defer (on viewport; prefetch on
  idle)` for heavy components (map), **never** `hydrate on …` (client-rendered). `[class.x]/[style.x]` not
  `ngClass/ngStyle`; host bindings via the `host` object; `NgOptimizedImage`; `DestroyRef.onDestroy`;
  `afterRender/afterNextRender` for DOM work.
- **C11** `remult.repo()` directly (no wrapper services); wrap all Remult calls in `ResultAsync.fromPromise`. `scope:web`
  must not import `hono`. Any new domain logic belongs on the entity in `libs/shared/domain` (it stays Angular-free) —
  but none is needed here.

Accessibility (WCAG-AA):

- **C12** Keep the single `:focus-visible` ring (base layer); add `mat.strong-focus-indicators()` +
  `prefers-contrast: more` + `forced-colors` fallbacks. Material Symbols via ligatures; `matIconButton` always labelled.
  Honour `prefers-reduced-motion`. New surfaces get landmarks/roles/aria-names + full keyboard nav; colour never the
  sole signal.

Testing:

- **C13** Vitest. Web specs: TestBed + standalone imports (jsdom); never `fixture.detectChanges()`/`fakeAsync`/`tick` —
  drive CD with `await fixture.whenStable()` (after `componentRef.setInput`/signal set) or `TestBed.tick()` (pending
  `resource()`/reactive-form mutation); time via `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync()`. Material
  read/driven via CDK harnesses only (never `By.css('mat-…')`); raw `querySelector` only for app-owned markup/testids.
  `expect(await findAxeViolations(el)).toEqual([])` per screen (contrast/region disabled under jsdom — verified instead
  in a real browser via Playwright MCP). Domain specs (if any) use `InMemoryDataProvider`, never `@angular/*`/TestBed.

---

## 9. Build sequence (phases — detailed plan to follow via writing-plans)

Each phase ends green on `bun run check:ci` + relevant tests, and is independently reviewable.

0. **Foundation — tokens & theme.** Retune `mat.theme()` + add component overrides; add/verify `--color-status-*` and
   new tone/severity/spacing tokens for **both** light and dark; density. Regression-check existing screens (axe +
   visual in both themes).
1. **Shared primitives.** `kpi-tile`, `cadence-countdown`, `status-mix-bar`, severity class-map utilities + specs.
2. **App shell.** Restyle toolbar/sidenav/user-chip; add Overview nav; Material-consistent dev-user-switcher;
   theme-toggle. Preserve a11y + RouterLinkActive + contentWidth signal.
3. **Overview dashboard.** New lazy `/overview` (default landing) + `OverviewComponent`, LiveQuery + computed
   KPIs/needs-attention/status-mix/recent-activity/district-rollup (elevated) + ticking-now signal + dashboard map +
   specs + axe.
4. **Incident list.** Severity-forward rows + density toggle; preserve LiveQuery/sort/paginator/viewState/canCreate/
   testids; update specs.
5. **Incident detail + map + timeline.** Add `incident-timeline` (eager) + `incident-map` (deferred Leaflet + SVG
   fallback); add `leaflet` dep; restyle hero/metrics/actions/sitreps; preserve resource/permissions/dialog/invoke/
   testids/@defer panel; specs.
6. **Forms & dialogs.** Restyle within the metadata engine + dialog templates; preserve all contracts; update specs.
7. **A11y + responsive + cross-theme pass.** Per-screen axe (jsdom) + Playwright real-browser contrast/focus/landmark in
   light + dark + system at desktop/tablet/handset; reduced-motion; keyboard sweeps. `project-words.txt`; `just ci`.

---

## 10. Risks & mitigations

- **Forms engine is load-bearing** — restyling `dynamic-form.ts`/`form-page.ts` can silently break all three forms.
  *Mitigation:* keep the widget `@switch`, `SPAN_CLASS` literals, grid container-queries, `firstError` mapping, and
  `form.events` effect; touch only CSS/Material overrides. Keep every included field in exactly one form-config group.
- **Global theming blast radius** — token/`mat.theme()` changes affect every Material component and Tailwind utility.
  *Mitigation:* Phase 0 lands tokens first and regression-checks existing screens in both themes before feature work.
- **Tailwind static-class purge** — dynamic severity/state class names vanish in prod builds. *Mitigation:* literal
  `Readonly<Record<…>>` maps everywhere (the `TONE_CLASSES` discipline).
- **Map offline / OSM policy** — tiles may be blank in the devcontainer/demo, and OSM bars heavy use. *Mitigation:*
  swappable `TILE_URL`, attribution, and the SVG-plot fallback on `tileerror`; document a production tile provider.
- **Spec suite coupling** — existing specs assert testids/view-state copy/structure; DOM/testid changes break the gate.
  *Mitigation:* preserve testids and update specs alongside each phase; CDK harnesses + axe per new screen.
- **Zoneless clock for overdue** — `nextReportDue < now` won't re-emit on its own. *Mitigation:* a ticking signal
  (30–60s) for the dashboard; the detail timeline takes `now` as an input and recomputes on load/reload.

---

## 11. Non-goals

No domain/schema/API change; no Phase 5 "add a field" demo; no real auth; no new domains; no async/background jobs,
PDF, or external messaging (per `docs/00-plan.md` "Deliberately Out of Scope").
