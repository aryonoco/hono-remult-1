# Fire Incidents "Tactical Command" UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and extend the fire-incidents Angular feature into a severity-forward "Tactical Command" operations console — a new Operations dashboard, a Leaflet map + lifecycle timeline on the detail page, a severity-forward incident list, and a Rosé Pine (Dawn/Moon) theme — fully WCAG 2.2 AA in both themes, with zero behavioural regressions.

**Architecture:** Drive everything from the token layer (`tailwind.css` + `styles.scss`): Rosé Pine system colours via `mat.theme-overrides()`, fire-status tones via `--color-status-*` `light-dark()` pairs. Add small standalone OnPush signal components (`kpi-tile`, `cadence-countdown`, `status-mix-bar`, `incident-map`, `incident-timeline`, `OverviewComponent`). Reuse existing Remult `repo`/LiveQuery patterns; preserve every existing behavioural contract and `data-testid`.

**Tech Stack (verified versions — do not deviate):** Angular 21.2.15 (zoneless, standalone, signals, OnPush), @angular/material + @angular/cdk 21.2.13, Tailwind CSS 4.3.0 (CSS-first), Remult 3.3.10, neverthrow 8.2.0, Leaflet 1.9.4 + @types/leaflet 1.9.21 (NEW), Vitest 4.1.7 + jsdom, axe-core ^4.11.4, Bun 1.3.14, Nx 22.7.5, TypeScript 5.9.3.

---

## §A — Locked Contracts (the determinism backbone)

Everything in this section is fixed. Later tasks reference these names/values verbatim. No task may introduce a name, token, or value not defined here.

### A.1 New dependencies (apps/web only — `scope:web`)

Add to `package.json` `dependencies`: `"leaflet": "1.9.4"`. To `devDependencies`: `"@types/leaflet": "1.9.21"`. Install with `bun install`. Never add Leaflet to `libs/shared/domain`.

### A.2 Font weights (Google Fonts CDN — keep CDN, widen weight axes)

`apps/web/src/index.html` currently loads `Libre+Franklin:wght@600;700`, `Public+Sans:wght@400;500;600`, `IBM+Plex+Mono:wght@400;500`. Replace the family `<link>` href with exactly:

```
https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@500;600;700;800&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap
```

(Adds Libre Franklin 500/800, Public Sans 700, IBM Plex Mono 600.) Leave the Material Symbols `<link>` and the two `preconnect` links unchanged.

### A.3 Barrel re-export additions (`libs/shared/domain/src/index.ts`)

The web app imports only from `@workspace/shared-domain`. These symbols exist in `fire/helpers.ts` but are NOT re-exported and ARE needed: add to the helpers re-export line — `INITIAL_REPORT_MS`. (`MS_PER_MINUTE`, `MS_PER_HOUR`, `MS_PER_DAY`, `MS_PER_MONTH_NOMINAL`, `TERMINAL_STATUSES`, `SAFE_VARIANT_STATUSES`, `ACTIVE_CONTAINED_STATUSES`, `LEVEL_ORDER`, `POTENTIAL_ORDER`, `TIMESTAMP_PAIRS`, `LIMITS`, `statusTone`, `StatusTone`, `STATUS_TONES`, and all `*_LABELS` are already exported.) Do NOT attempt to import `RAPID_REPORT_MS`/`ACTIVE_GOING_MS`/`ACTIVE_CONTAINED_MS` (module-private) or `toError`/`validateAdjacentTimestamps` (not needed in web).

### A.4 Rosé Pine token table — AA-verified, HSL, `light-dark(Dawn, Moon)`

All contrast ratios computed and verified (WCAG: ≥4.5:1 text, ≥3:1 UI/graphics) in `tools/check-contrast.mjs` (added in Phase 0, kept as a guard). **System tokens** go in `styles.scss` via `mat.theme-overrides(( … ))` inside the existing `html {}` in `@layer material`. Keys are the `--mat-sys-*` names without prefix:

```scss
@include mat.theme-overrides((
  // surfaces (Rosé Pine base / surface / overlay)
  surface:                    light-dark(hsl(32 57% 95%),  hsl(246 24% 17%)),
  surface-container-lowest:   light-dark(hsl(32 57% 95%),  hsl(245 22% 14%)),
  surface-container-low:      light-dark(hsl(35 100% 98%), hsl(246 24% 17%)),
  surface-container:          light-dark(hsl(35 100% 98%), hsl(248 24% 20%)),
  surface-container-high:     light-dark(hsl(28 40% 92%),  hsl(248 21% 26%)),
  surface-container-highest:  light-dark(hsl(28 40% 92%),  hsl(247 16% 30%)),
  surface-bright:             light-dark(hsl(35 100% 98%), hsl(248 21% 26%)),
  surface-dim:                light-dark(hsl(28 40% 92%),  hsl(246 24% 17%)),
  background:                 light-dark(hsl(32 57% 95%),  hsl(246 24% 17%)),
  on-background:              light-dark(hsl(248 19% 40%), hsl(245 50% 91%)),
  // foreground text
  on-surface:                 light-dark(hsl(248 19% 40%), hsl(245 50% 91%)),  // text  (6.66 / 11.86)
  on-surface-variant:         light-dark(hsl(248 12% 48%), hsl(248 15% 61%)),  // muted (4.58 / 4.86)
  // outlines
  outline:                    light-dark(hsl(248 12% 52%), hsl(249 12% 47%)),  // component 1.4.11 (4.02 / 3.03)
  outline-variant:            light-dark(hsl(10 9% 86%),   hsl(247 16% 30%)),  // decorative
  // primary = iris
  primary:                    light-dark(hsl(268 21% 52%), hsl(267 57% 78%)),  // on-primary 4.60 / 7.47
  on-primary:                 light-dark(hsl(0 0% 100%),   hsl(246 24% 17%)),
  primary-container:          light-dark(hsl(268 30% 88%), hsl(267 26% 34%)),
  on-primary-container:       light-dark(hsl(268 30% 30%), hsl(267 57% 88%)),
  inverse-primary:            light-dark(hsl(267 57% 78%), hsl(268 21% 52%)),
  // secondary = foam
  secondary:                  light-dark(hsl(189 30% 40%), hsl(189 43% 73%)),
  on-secondary:               light-dark(hsl(0 0% 100%),   hsl(246 24% 17%)),
  secondary-container:        light-dark(hsl(189 30% 88%), hsl(189 30% 30%)),
  on-secondary-container:     light-dark(hsl(189 40% 24%), hsl(189 43% 85%)),
  // tertiary = rose
  tertiary:                   light-dark(hsl(3 53% 53%),   hsl(2 66% 75%)),
  on-tertiary:                light-dark(hsl(0 0% 100%),   hsl(246 24% 17%)),
  tertiary-container:         light-dark(hsl(3 60% 90%),   hsl(2 30% 34%)),
  on-tertiary-container:      light-dark(hsl(3 45% 32%),   hsl(2 66% 88%)),
  // error = love
  error:                      light-dark(hsl(343 35% 52%), hsl(343 76% 68%)),
  on-error:                   light-dark(hsl(0 0% 100%),   hsl(246 24% 17%)),
  error-container:            light-dark(hsl(343 50% 91%), hsl(343 30% 34%)),
  on-error-container:         light-dark(hsl(343 40% 34%), hsl(343 76% 88%)),
  // inverse / scrim
  inverse-surface:            light-dark(hsl(246 24% 17%), hsl(35 100% 98%)),
  inverse-on-surface:         light-dark(hsl(245 50% 91%), hsl(248 19% 40%)),
  shadow:                     hsl(246 24% 8%),
  scrim:                      hsl(246 24% 8%),
));
```

**Fire-status tones** replace the existing `--color-status-*` hex literals in `tailwind.css` plain `@theme` (verbatim — fg + bg per tone):

```css
--color-status-going:        light-dark(hsl(343 35% 46%), hsl(343 76% 71%));
--color-status-going-bg:     light-dark(hsl(13 42% 91%),  hsl(300 20% 23%));
--color-status-contained:    light-dark(hsl(35 81% 32%),  hsl(35 88% 72%));
--color-status-contained-bg: light-dark(hsl(35 70% 91%),  hsl(338 8% 26%));
--color-status-controlled:   light-dark(hsl(189 30% 36%), hsl(189 43% 73%));
--color-status-controlled-bg:light-dark(hsl(90 8% 90%),   hsl(224 19% 27%));
--color-status-safe:         light-dark(hsl(197 53% 34%), hsl(197 48% 56%));
--color-status-safe-bg:      light-dark(hsl(100 5% 88%),  hsl(218 31% 23%));
--color-status-neutral:      light-dark(hsl(248 12% 44%), hsl(248 15% 67%));
--color-status-neutral-bg:   light-dark(hsl(20 18% 90%),  hsl(248 18% 25%));
--color-status-missing:      light-dark(hsl(268 21% 46%), hsl(267 57% 78%));
--color-status-missing-bg:   light-dark(hsl(0 18% 91%),   hsl(254 20% 28%));
```

**Semantic mapping (fixed):** going=love, contained=gold, controlled=foam, safe=pine, neutral=subtle, missing=iris; M3 primary=iris, secondary=foam, tertiary=rose, error=love. Status spines/pins/severity-tile fills use the `text-status-*` (fg) token (AA vs base, ≥5:1 both themes) — never the raw accent. `going` keeps Rosé Pine `love` (semantically "danger"; renders pink in Moon — intentional, AA-verified).

### A.5 New `@theme inline` bridges (add to `tailwind.css` `@theme inline`)

```css
--color-on-surface-variant: var(--mat-sys-on-surface-variant);
--color-surface-container-low: var(--mat-sys-surface-container-low);
--color-surface-container-high: var(--mat-sys-surface-container-high);
--color-surface-container-highest: var(--mat-sys-surface-container-highest);
--color-tertiary: var(--mat-sys-tertiary);
--color-on-tertiary: var(--mat-sys-on-tertiary);
--color-secondary: var(--mat-sys-secondary);
```

(Generates `text-on-surface-variant`, `bg-surface-container-low/high/highest`, `bg-tertiary`, `text-secondary`, etc., that re-theme live. The existing `--color-muted`, `--color-surface`, `--color-on-surface`, `--color-primary`, `--color-outline`, `--color-outline-variant`, `--color-error` bridges stay.)

### A.6 File structure / map

| File                                                                                              | Action    | Responsibility                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/styles.scss`                                                                        | Modify    | `@import 'leaflet/dist/leaflet.css'` (line 1); add `mat.theme-overrides()`; add `mat.strong-focus-indicators()`; add `.fire-marker*` global classes; keep `@layer` order |
| `apps/web/src/tailwind.css`                                                                       | Modify    | Replace `--color-status-*` with Rosé Pine HSL; add A.5 bridges                                                                                                           |
| `apps/web/src/index.html`                                                                         | Modify    | Font weight axes (A.2)                                                                                                                                                   |
| `apps/web/src/main.ts`                                                                            | unchanged | —                                                                                                                                                                        |
| `tools/check-contrast.mjs`                                                                        | Create    | Committed AA-contrast guard over the A.4 token pairs                                                                                                                     |
| `libs/shared/domain/src/index.ts`                                                                 | Modify    | Re-export `INITIAL_REPORT_MS` (A.3)                                                                                                                                      |
| `apps/web/src/app/shared/auth/permissions.ts`                                                     | Modify    | Add `canViewDistrictRollup(user)` = elevated                                                                                                                             |
| `apps/web/src/app/shared/components/kpi-tile/kpi-tile.ts`                                         | Create    | KPI instrument tile                                                                                                                                                      |
| `apps/web/src/app/shared/components/cadence-countdown/cadence-countdown.ts`                       | Create    | `nextReportDue` countdown chip                                                                                                                                           |
| `apps/web/src/app/shared/components/status-mix-bar/status-mix-bar.ts`                             | Create    | Stacked status proportion bar                                                                                                                                            |
| `apps/web/src/app/shared/components/severity-tile/severity-tile.ts`                               | Create    | Square level/severity glyph tile                                                                                                                                         |
| `apps/web/src/app/shared/ui/tone-classes.ts`                                                      | Create    | Shared `Readonly<Record<StatusTone,string>>` literal maps (spine/tile/marker)                                                                                            |
| `apps/web/src/app/app.ts` / `app.html` / `app.css`                                                | Modify    | Shell restyle + Overview nav item                                                                                                                                        |
| `apps/web/src/app/app.routes.ts`                                                                  | Modify    | Default redirect → `overview`; add lazy `overview` route                                                                                                                 |
| `apps/web/src/app/features/overview/overview.ts`                                                  | Create    | Operations dashboard (LiveQuery + computed KPIs)                                                                                                                         |
| `apps/web/src/app/features/overview/overview.spec.ts`                                             | Create    | Dashboard spec + axe                                                                                                                                                     |
| `apps/web/src/app/features/fire-incidents/incident-list/incident-list.{ts,html}`                  | Modify    | Severity-forward rows + density toggle (keep MatTable substrate)                                                                                                         |
| `apps/web/src/app/features/fire-incidents/incident-detail/incident-map/incident-map.ts`           | Create    | Leaflet map (detail + overview), deferred                                                                                                                                |
| `apps/web/src/app/features/fire-incidents/incident-detail/incident-timeline/incident-timeline.ts` | Create    | Lifecycle timeline                                                                                                                                                       |
| `apps/web/src/app/features/fire-incidents/incident-detail/incident-detail.{ts,html}`              | Modify    | Hero + stats + map + timeline; restyle                                                                                                                                   |
| `apps/web/src/app/features/fire-incidents/incident-detail/final-report-panel.ts`                  | Modify    | Visual restyle only (keep IO + testids)                                                                                                                                  |
| `apps/web/src/app/shared/forms/dynamic-form.ts` / `form-page.ts`                                  | Modify    | Restyle only (keep widget switch, SPAN_CLASS, testids)                                                                                                                   |
| `apps/web/src/app/features/fire-incidents/dialogs/escalate-dialog.ts`, `shared/dialogs/*`         | Modify    | Restyle only (keep data/result contracts)                                                                                                                                |
| `apps/web/src/app/shared/components/dev-user-switcher.ts`                                         | Modify    | Material-consistent restyle                                                                                                                                              |
| `project-words.txt`                                                                               | Modify    | Add cspell words (leaflet, divIcon, cartocdn, positron, maptiler, tileerror, invalidateSize, basemaps, Rosé, rosepine)                                                   |

### A.7 New component public APIs (fixed signatures)

```ts
// shared/ui/tone-classes.ts
export const SPINE_TONE: Readonly<Record<StatusTone, string>>;     // 'bg-status-going' … (full literals)
export const SEVERITY_TILE_TONE: Readonly<Record<StatusTone, string>>;
export const MARKER_TONE_CLASS: Readonly<Record<StatusTone, string>>; // 'fire-marker--going' …
export interface MapPoint { lat: number; lng: number; tone: StatusTone; name: string; } // shared by overview + incident-map

// shared/components/kpi-tile/kpi-tile.ts — selector 'app-kpi-tile'
label = input.required<string>(); value = input.required<string | number>();
unit = input(''); tone = input<'accent' | StatusTone>('accent');
emphasis = input(false); link = input<string | undefined>(undefined); live = input(false);

// shared/components/cadence-countdown/cadence-countdown.ts — selector 'app-cadence-countdown'
due = input.required<Date | null>(); now = input<Date>(new Date());
// computed state(): 'overdue'|'soon'|'upcoming'|'none'; text(): mono string; soon = within 60 min

// shared/components/status-mix-bar/status-mix-bar.ts — selector 'app-status-mix-bar'
counts = input.required<Readonly<Record<FireStatus, number>>>();

// shared/components/severity-tile/severity-tile.ts — selector 'app-severity-tile'
level = input.required<IncidentLevel>(); tone = input.required<StatusTone>(); major = input(false);

// features/fire-incidents/incident-detail/incident-map/incident-map.ts — selector 'app-incident-map'
points = input.required<readonly MapPoint[]>();   // MapPoint = { lat: number; lng: number; tone: StatusTone; name: string }
locationDescription = input(''); singleZoom = input(11);
// (detail passes one point; overview passes many)

// features/fire-incidents/incident-detail/incident-timeline/incident-timeline.ts — selector 'app-incident-timeline'
fire = input.required<FireIncident>(); sitreps = input<readonly SituationReport[]>([]);
finalReport = input<FinalReport | undefined>(undefined); now = input<Date>(new Date());
// internal: interface TimelineEvent { kind: 'started'|'detected'|'reported'|'crewSent'|'crewArrived'|'declaredMajor'|'sitrep'|'signOff'|'nextDue'; at: Date; label: string; tone: StatusTone | 'event' | 'overdue'; status?: FireStatus; reportNumber?: number; detail?: string; future?: boolean; overdue?: boolean }
```

### A.8 Preserved behavioural contracts (MUST NOT change)

- **incident-list:** the LiveQuery `include:{district:true}` + `mapSort` + `effect`/`DestroyRef` re-subscription; `displayedColumns` (9, order unchanged) + sort keys `name`/`fireNumber`/`statusAsAt`/`district`; `viewState` values `anonymous|loading|error|empty|content`; `canCreate` gate; `aria-live` count; `mat-paginator [5,10,25]`; `aria-label="Fire incidents"`.
- **incident-detail:** `resource()` `params`/`loader` with `include.finalReport = canViewFinalReport(user)` (never include for viewers); every `can*` computed; `invoke()` ResultAsync + NotificationService + LiveAnnouncer + `reload()`; the `@defer (on viewport; prefetch on idle)` final-report panel with `data-testid="final-report-placeholder"`; action `data-testid`s `action-edit|action-escalate|action-sitrep|action-create-final|action-delete`.
- **final-report-panel:** inputs `report/fireId/canSign/canRemoveSign/canEditFinal`, outputs `signOff/removeSignOff`; testids `final-report-panel|action-signoff|action-remove-signoff|action-edit-final`.
- **forms engine:** `dynamic-form` `@switch(field.widget)` 8 cases; `SPAN_CLASS` literals `col-12/6/4/3`; container-query 12-col grid; `firstError()` order; `form.events`→`markForCheck` effect. `form-page` `FormPageState` `anonymous|loading|notFound|ready`; outputs `save/cancel`; testids `form-cancel|form-save`; `formDirty` live region. The three feature form components & `*.form-config.ts` keep `assertGroupsCoverIncluded` invariants.
- **dialogs:** `EscalateDialogData`/result (`IncidentLevel|undefined`), `ConfirmDialogData`/`true|undefined`, `ConfirmReasonDialogData`/`{reason}|undefined`.
- **status-badge:** reused unchanged; `statusTone()` is the single source of tone.
- **ThemeService:** default `'system'`, key `'fire-theme'`, `theme()`/`setTheme()`/`cycle()`, `data-theme` on `<html>`. Default is NOT changed to dark.

### A.9 Testing protocol (every component task)

- Vitest via `bunx nx test web` (or `bunx nx run-many -t test`). Web specs: TestBed + standalone imports (jsdom).
- Drive CD with `await fixture.whenStable()` after `componentRef.setInput(...)` / signal set; use `TestBed.tick()` for pending `resource()`/imperative reactive-form mutation. **Never** `fixture.detectChanges()`, `fakeAsync`, `tick`, `flush`, `waitForAsync`. Time: `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(n)` then `await fixture.whenStable()`.
- Material widgets via CDK harnesses (`MatButtonHarness`, `MatTableHarness`, `MatSelectHarness`, `MatDialogHarness` via `documentRootLoader`, …) — never `By.css('mat-…')`. Raw `querySelector` only for app-owned markup / `data-testid` / plain text.
- Structural a11y per screen: `expect(await findAxeViolations(fixture.nativeElement)).toEqual([])` (note: `color-contrast` and `region` are disabled under jsdom — never re-enable; verify those in a real browser).
- Stub injected providers as needed: `provideRouter([])`, `provideNativeDateAdapter()`, `{ provide: MAT_DATE_LOCALE, useValue: 'en-AU' }`, `{ provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' }`, a fake `NotificationService`, `MatDialog`, `BreakpointObserver`. Remult: `InMemoryDataProvider` + `remult.user` for data-driven specs.
- Spies: `vi.fn`/`vi.spyOn`. Spec files relax `noExplicitAny`/`noNonNullAssertion`/`noMagicNumbers`/`useExplicitType`/`noExcessiveLinesPerFunction`.
- Real-browser verification (contrast, focus, landmark, live map, keyboard) via Playwright MCP at `http://localhost:4200` (light + dark + system; desktop 1320×960, tablet 820, handset 390).
- **CI gate after every phase:** `bun run check:ci` must pass (Biome + ESLint + `tsc -b`). End of plan: `just ci`. New component CSS must stay under the **8 kB per-component style budget**.

### A.10 a11y acceptance (WCAG 2.2 AA) — applied per surface

- Changing counts (Overdue, Major): `role="status"` (implies `aria-live=polite` + `aria-atomic` — do not also add them); errors `role="alert"`; never both on one node.
- Dashboard: one `<main>`; each section a `region` via `aria-labelledby` a heading; navigating tiles are `<a routerLink>`, action tiles `<button>`.
- Sortable table: keep `aria-label="Fire incidents"`; add `sortActionDescription` per sortable header; call CDK `LiveAnnouncer` on `matSortChange`.
- Timeline: `<ol role="list">`/`<li>`, decorative dots `aria-hidden`, `<time [attr.datetime]>` ISO, labels from `*_LABELS`, overdue marker `role="status"` paired with text.
- Map: container `role="region"` + `aria-label` (not containing the word "map"), `keyboard:true`, visible focus ring, text equivalent (mono lat/long `dl` + `locationDescription`); `prefers-reduced-motion` honoured; pins are decorative-essential exempt.
- Severity colour never the sole signal — always paired with text/label/icon.
- Route change: focus the new `<h1 tabindex="-1">` + polite `LiveAnnouncer`; never focus `<body>`/landmark. `scroll-margin-top` on focus targets under sticky bars (SC 2.4.11).
- Target size ≥24×24px (matIconButton uses Material's 48px target); forms `aria-describedby` errors + `aria-invalid` from state.

---

## §A.11 — Fixtures & scale adaptation (commit `0aa9e01`) — AUTHORITATIVE (supersedes referenced tasks)

The DB is seeded deterministically: **~13,453 FireIncidents** across **16 DEECA districts** (FY2018–FY2026), 37,948 SituationReports, 7,029 FinalReports. Author fields (`createdBy`/`submittedBy`/`signedOffBy`/`signOffRemovedBy`) are **operator ids** (e.g. `op-45-3`); coordinates are real (district-polygon-sampled); `District` now exposes `regionId`/`regionName`/`roseName`/`ifisId`/`deecaCostCentre`/`pvCostCentre`. **No domain/api change is needed** (shipped) — the UI consumes the new barrel exports (`operatorName`, `District.regionName`, …).

**Scale is seasonal — design for the worst case.** The anchor date is 2026-05-31 (season's end → only ~12 active right now), but in **January peak** active incidents reach the **hundreds** (a severe season ≈ 3,000+ fires/FY). Therefore **no surface may load the active/non-terminal set wholesale**, and the LiveQuery default cap (100) must never be the silent bound on a count.

**Use Remult optimally — the data-layer contract (every read wrapped in `ResultAsync.fromPromise`):**

- **Counts** → `repo.count(filter)` (server-side, exact, scale-independent): active `count({ status: { $nin: [...TERMINAL_STATUSES] } })`; going `count({ status: FireStatus.going })`; major `count({ isMajor: true, status: { $nin: [...TERMINAL_STATUSES] } })`; overdue-active `count({ status: { $nin: [...TERMINAL_STATUSES] }, nextReportDue: { $lt: now } })`.
- **Sums** → `repo.aggregate({ sum: ['fireAreaHectares'], where })` → `result.fireAreaHectares.sum` (+ `result.$count`). Never `aggregate` with `group`.
- **Breakdowns** → `repo.groupBy({ group: ['status'], where })` → `rows[i].status` / `rows[i].$count`; region rollup `groupBy({ group: ['districtId'], where })` + one-time `repo(District).find()` (16 rows) to map `districtId → regionName`. (Array form — the in-repo skill doc's `by: { …true }` is wrong for Remult 3.3.10; trust the `.d.ts`.)
- **Bounded row fetches only** → `liveQuery({ where, orderBy, limit, include })` / `find({ where, orderBy, limit, select })` with an explicit `limit`. No client `reduce` over an unbounded set.
- **Server pagination** → `liveQuery({ where, orderBy, limit: pageSize, page: pageIndex + 1, include })`.

**Adaptations (override the original Phase 3/4/5/6 tasks where they conflict):**

1. **Author names — `operatorName(id)`.** Import from `@workspace/shared-domain`; render it (never the raw id) at every author site: detail (created-by + sign-off attribution), `final-report-panel` (signed-off-by / sign-off-removed-by), sitrep display (submitted-by), dashboard recent-activity (submitted-by), timeline sign-off event.
2. **Terminal-aware cadence (data correctness).** 7,599 seeded *terminal* fires keep a stale past `nextReportDue`, so a countdown on a closed fire is wrong. Add `apps/web/src/app/shared/util/fire-status.ts` → `export function isTerminalStatus(s: FireStatus): boolean { return (TERMINAL_STATUSES as readonly FireStatus[]).includes(s); }`. Wherever a cadence countdown/overdue marker shows for a row/fire, pass `due = isTerminalStatus(status) ? null : (nextReportDue ?? null)`; gate the timeline `nextDue` event on `!isTerminalStatus(fire.status)`.
3. **Incident list — server pagination + filters (replaces the Phase 4 client-load).** Default filter **current financial year** (`computeFinancialYear(new Date())` = 2026; never unbounded). Filters: financial year (FY2018…FY2026 + All), status group (All / Active / Going / Resolved), district (elevated only; All + 16). Paginator total ← `repo.count(where)`. Server-sortable: `name`, `fireNumber`, `statusAsAt`, `createdAt`; `district` column sorts by `districtId`. All 9 columns stay displayed.
4. **Dashboard — operational (server aggregates, tick-refreshed) + season (FY aggregates).** No wholesale active load. KPIs via `count`/`aggregate`; status-mix via `groupBy(['status'])`; **needs-attention** via bounded `liveQuery({ where: active, orderBy: { nextReportDue: 'asc' }, limit: 10, include: { district: true } })` (live; client tiebreak going/level/major); **map** via capped `find({ where: active, orderBy: { statusAsAt: 'desc' }, limit: 500, select: { id, name, latitude, longitude, status } })` with a "+N more" note when `activeCount > 500`. A 60s tick signal (cleaned via `DestroyRef`) + user-change re-runs aggregates/find. A **Season panel** (FY selector, default current FY): total fires (`count({ financialYear })`), area burnt (`aggregate(sum, { financialYear })`), by-status (`groupBy(['status'], { financialYear })`); **by-region rollup** (elevated only) via `groupBy(['districtId'], { financialYear })` + District→region map. Season queries refetch on FY/user change only. The "LIVE" indicator is honest — tied to the needs-attention liveQuery + tick.
5. **Map at scale.** Overview map plots active points only (cap 500 + note); detail map plots the one incident.
6. **Seed dependency.** `just db-seed` (idempotent) loads fixtures; `just db-reset` reloads. Phase 0 Task 0.10 verifies. Dashboard/list specs seed a small representative `InMemoryDataProvider` set and assert the *query options* used (spy `repo.count`/`groupBy`/`aggregate`), never a 13k load.

---

## Phase 0 — Foundation: dependencies, Rosé Pine tokens, AA guard

**Outcome:** Rosé Pine theme live in both modes across the *existing* screens with no regressions; Leaflet installed; AA contrast proven by a committed script.

### Task 0.1: Install Leaflet

**Files:** Modify `package.json`; Test: command output.

- [ ] **Step 1 — Add deps.** In `package.json`, add `"leaflet": "1.9.4"` to `dependencies` and `"@types/leaflet": "1.9.21"` to `devDependencies` (keep alphabetical order).
- [ ] **Step 2 — Install.** Run: `bun install`. Expected: lockfile updates, `node_modules/leaflet` and `node_modules/@types/leaflet` present.
- [ ] **Step 3 — Verify.** Run: `ls node_modules/leaflet/dist/leaflet.css && bun pm ls | grep leaflet`. Expected: CSS path prints; `leaflet@1.9.4`, `@types/leaflet@1.9.21`.
- [ ] **Step 4 — Commit.** `git add package.json bun.lock && git commit -m "web: add leaflet 1.9.4 for incident maps"`

### Task 0.2: Re-export `INITIAL_REPORT_MS` from the domain barrel

**Files:** Modify `libs/shared/domain/src/index.ts`.

- [ ] **Step 1 — Add the symbol** to the existing `export { … } from './fire/helpers'` statement: insert `INITIAL_REPORT_MS` (keep alphabetical with the other `MS_*`/`INITIAL_*` names).
- [ ] **Step 2 — Verify it compiles & is reachable.** Run: `bunx nx run shared-domain:build` (or `bunx tsc -b`). Expected: success.
- [ ] **Step 3 — Commit.** `git add libs/shared/domain/src/index.ts && git commit -m "shared: re-export INITIAL_REPORT_MS for web cadence display"`

### Task 0.3: Widen font weight axes

**Files:** Modify `apps/web/src/index.html`.

- [ ] **Step 1 — Replace the families `<link>` href** with the A.2 URL exactly (Libre Franklin 500;600;700;800, Public Sans 400;500;600;700, IBM Plex Mono 400;500;600). Leave the Material Symbols link + preconnects untouched.
- [ ] **Step 2 — Commit.** `git add apps/web/src/index.html && git commit -m "web: widen font weight axes for tactical type ramp"`

### Task 0.4: Rosé Pine system tokens + Leaflet CSS + strong focus

**Files:** Modify `apps/web/src/styles.scss`.

- [ ] **Step 1 — Import Leaflet CSS** as the **first line** of `styles.scss` (before `@use '@angular/material'`): `@import 'leaflet/dist/leaflet.css';`
- [ ] **Step 2 — Add `mat.theme-overrides()`** inside the existing `html { … }` block in `@layer material`, immediately after the existing `@include mat.theme(( … ))` call, pasting the **A.4 system-token block verbatim**.
- [ ] **Step 3 — Add strong focus indicators.** Below the overrides, still in `@layer material` `html {}`: `@include mat.strong-focus-indicators();`
- [ ] **Step 4 — Add global marker classes** in `@layer utilities` of `styles.scss`:

```scss
@layer utilities {
  .fire-marker { display: grid; place-items: center; }
  .fire-marker__dot { width: 14px; height: 14px; border-radius: 9999px; border: 2px solid var(--mat-sys-surface); }
  .fire-marker--going  .fire-marker__dot { background: var(--color-status-going); }
  .fire-marker--contained  .fire-marker__dot { background: var(--color-status-contained); }
  .fire-marker--controlled .fire-marker__dot { background: var(--color-status-controlled); }
  .fire-marker--safe   .fire-marker__dot { background: var(--color-status-safe); }
  .fire-marker--neutral .fire-marker__dot { background: var(--color-status-neutral); }
  .fire-marker--missing .fire-marker__dot { background: var(--color-status-missing); }
}
```

- [ ] **Step 5 — Build check.** Run: `bunx nx build web --configuration=development` (or `bun run check:ci`). Expected: Sass compiles, no `mat.theme-overrides` key errors.
- [ ] **Step 6 — Commit.** `git add apps/web/src/styles.scss && git commit -m "web: apply Rosé Pine system tokens + leaflet css + strong focus"`

### Task 0.5: Rosé Pine fire-status tones + new bridges

**Files:** Modify `apps/web/src/tailwind.css`.

- [ ] **Step 1 — Replace** the existing `--color-status-*` block in plain `@theme` with the **A.4 fire-status block verbatim** (HSL `light-dark()`), keeping the surrounding fonts/containers/radii tokens.
- [ ] **Step 2 — Add the A.5 bridges** to the `@theme inline` block.
- [ ] **Step 3 — Build check.** Run: `bun run check:ci`. Expected: pass.
- [ ] **Step 4 — Commit.** `git add apps/web/src/tailwind.css && git commit -m "web: map fire-status tones to Rosé Pine (AA, HSL)"`

### Task 0.6: AA contrast guard (committed)

**Files:** Create `tools/check-contrast.mjs`; Modify `package.json` (script); Modify `justfile` (optional CI hook).

- [ ] **Step 1 — Create `tools/check-contrast.mjs`** encoding every A.4 text/UI pair (Dawn + Moon) and asserting WCAG (text ≥4.5, UI/graphics ≥3.0). The file MUST `process.exit(1)` on any failure and print a table. (Use the verified pairs: on-surface↔surface/surface-container-high; on-surface-variant↔surface; outline↔surface@3.0; on-primary↔primary; on-secondary↔secondary; on-tertiary↔tertiary; on-error↔error; each `status-X` fg↔`status-X-bg`@4.5 and fg↔surface@3.0.)
- [ ] **Step 2 — Add script** to `package.json`: `"check:contrast": "node tools/check-contrast.mjs"`.
- [ ] **Step 3 — Run it.** Run: `bun run check:contrast`. Expected: every row `PASS`, exit 0.
- [ ] **Step 4 — Wire into `just ci`.** In `justfile`, add `bun run check:contrast` to the `ci` recipe before tests.
- [ ] **Step 5 — Commit.** `git add tools/check-contrast.mjs package.json justfile && git commit -m "web: add AA contrast guard for Rosé Pine tokens"`

### Task 0.7: cspell words

**Files:** Modify `project-words.txt`.

- [ ] **Step 1 — Add** (one per line, keep sorted): `basemaps`, `cartocdn`, `divIcon`, `invalidateSize`, `leaflet`, `maptiler`, `positron`, `rosepine`, `tileerror`.
- [ ] **Step 2 — Verify.** Run: `bunx cspell "docs/superpowers/**/*.md" "apps/web/src/**/*.ts"`. Expected: no unknown-word errors for these.
- [ ] **Step 3 — Commit.** `git add project-words.txt && git commit -m "chore: add map/theme terms to cspell dictionary"`

### Task 0.8: `canViewDistrictRollup` permission predicate

**Files:** Modify `apps/web/src/app/shared/auth/permissions.ts`; Test `apps/web/src/app/shared/auth/permissions.spec.ts`.

- [ ] **Step 1 — Write failing test** (append to `permissions.spec.ts`):

```ts
import { canViewDistrictRollup } from './permissions';
import { Roles } from '@workspace/shared-domain';

describe('canViewDistrictRollup', () => {
  it('is true for admin and stateOfficer, false otherwise', () => {
    expect(canViewDistrictRollup({ id: 'a', roles: [Roles.admin], districtId: null })).toBe(true);
    expect(canViewDistrictRollup({ id: 's', roles: [Roles.stateOfficer], districtId: null })).toBe(true);
    expect(canViewDistrictRollup({ id: 'e', roles: [Roles.incidentEditor], districtId: 12 })).toBe(false);
    expect(canViewDistrictRollup({ id: 'v', roles: [Roles.viewer], districtId: 12 })).toBe(false);
    expect(canViewDistrictRollup(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2 — Run, expect fail.** `bunx nx test web --testNamePattern="canViewDistrictRollup"` → FAIL (`canViewDistrictRollup` not exported).
- [ ] **Step 3 — Implement** in `permissions.ts` (reuse the existing private `isElevated`):

```ts
export function canViewDistrictRollup(user: CurrentUser | undefined): boolean {
  return isElevated(user);
}
```

- [ ] **Step 4 — Run, expect pass.** Same command → PASS.
- [ ] **Step 5 — Commit.** `git add apps/web/src/app/shared/auth/permissions.ts apps/web/src/app/shared/auth/permissions.spec.ts && git commit -m "web: add canViewDistrictRollup (elevated-only) predicate"`

### Task 0.9: Seed the development database (fixtures dependency)

**Files:** none (data only).

- [ ] **Step 1 — Seed.** Run: `just db-seed` (idempotent — truncates the fire tables and reloads the deterministic fixtures from commit `0aa9e01`).
- [ ] **Step 2 — Verify counts.** Run `PGPASSWORD=hrm_dev_password psql -h postgres -U hrm_app -d hono_remult_dev -At -c 'select count(*) from app."fireIncidents";'` → `13453`; `… from app.districts;` → `16`; active (`status not in ('safe','safeOverrun','safeNotFound','safeFalseAlarm','notFound')`) ≈ `12`; `… where "financialYear"=2026;` ≈ `1187`.
- [ ] **Step 3 — No commit** (data only). Re-run `just db-seed` whenever fixtures are needed; `just db-reset` for a clean reload.

### Task 0.10: Regression + theme verification (real browser)

**Files:** none (verification only).

- [ ] **Step 1 — Serve.** Run: `bunx nx serve web` and `bunx nx serve api` (background).
- [ ] **Step 2 — Playwright MCP sweep.** Open `http://localhost:4200/incidents` and `/incidents/:id`; toggle theme light → dark → system; at 1320, 820, 390 widths. Confirm: Rosé Pine surfaces/tones applied, status badges legible, no broken Material components, focus rings visible. Run a Lighthouse/axe check; confirm 0 contrast violations in both themes.
- [ ] **Step 3 — Full check.** Run: `bun run check:ci` → pass. Commit nothing (verification only); fix any regressions before proceeding.

---

## Phase 1 — Shared visual primitives

**Outcome:** Reusable, tested, OnPush signal components the dashboard/list/detail compose. All colour via tokens; all per-state classes are whole literals.

### Task 1.1: Tone class maps

**Files:** Create `apps/web/src/app/shared/ui/tone-classes.ts`; Test `apps/web/src/app/shared/ui/tone-classes.spec.ts`.

- [ ] **Step 1 — Write failing test:**

```ts
import { SPINE_TONE, SEVERITY_TILE_TONE, MARKER_TONE_CLASS } from './tone-classes';
import { STATUS_TONES } from '@workspace/shared-domain';

it('covers every StatusTone with literal classes', () => {
  const tones = [...new Set(Object.values(STATUS_TONES))];
  for (const t of tones) {
    expect(SPINE_TONE[t]).toContain('bg-status-');
    expect(SEVERITY_TILE_TONE[t]).toContain('text-surface');
    expect(MARKER_TONE_CLASS[t]).toBe(`fire-marker--${t}`);
  }
});
```

- [ ] **Step 2 — Run, expect fail** (`tone-classes` missing). `bunx nx test web --testNamePattern="literal classes"`.
- [ ] **Step 3 — Implement:**

```ts
import type { StatusTone } from '@workspace/shared-domain';

export const SPINE_TONE: Readonly<Record<StatusTone, string>> = {
  going: 'bg-status-going', contained: 'bg-status-contained', controlled: 'bg-status-controlled',
  safe: 'bg-status-safe', neutral: 'bg-status-neutral', missing: 'bg-status-missing',
};
export const SEVERITY_TILE_TONE: Readonly<Record<StatusTone, string>> = {
  going: 'bg-status-going text-surface', contained: 'bg-status-contained text-surface',
  controlled: 'bg-status-controlled text-surface', safe: 'bg-status-safe text-surface',
  neutral: 'bg-status-neutral text-surface', missing: 'bg-status-missing text-surface',
};
export const MARKER_TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  going: 'fire-marker--going', contained: 'fire-marker--contained', controlled: 'fire-marker--controlled',
  safe: 'fire-marker--safe', neutral: 'fire-marker--neutral', missing: 'fire-marker--missing',
};
// Shared map-point shape consumed by OverviewComponent and IncidentMapComponent.
export interface MapPoint { lat: number; lng: number; tone: StatusTone; name: string; }
```

- [ ] **Step 4 — Run, expect pass.** Same command → PASS.
- [ ] **Step 5 — Commit.** `git add apps/web/src/app/shared/ui/tone-classes.* && git commit -m "web: add shared status-tone class maps"`

### Task 1.2: `severity-tile` component

**Files:** Create `severity-tile/severity-tile.ts` + `.spec.ts`.

- [ ] **Step 1 — Write failing test** (`severity-tile.spec.ts`): create component, `setInput('level','levelThree')`, `setInput('tone','going')`, `setInput('major',true)`, `await fixture.whenStable()`; assert host text contains `3`, host class list includes `bg-status-going`, an element with `aria-label` mentioning "Level 3" and "major", and `expect(await findAxeViolations(fixture.nativeElement)).toEqual([])`.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:**

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type IncidentLevel, INCIDENT_LEVEL_LABELS, type StatusTone } from '@workspace/shared-domain';
import { SEVERITY_TILE_TONE } from '../../ui/tone-classes';

const LEVEL_DIGIT: Readonly<Record<IncidentLevel, string>> = { levelOne: '1', levelTwo: '2', levelThree: '3' };

@Component({
  selector: 'app-severity-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-grid place-items-center rounded-card font-display font-extrabold' },
  template: `<span [class]="toneClass()" class="grid h-10 w-10 place-items-center rounded-card text-lg"
      role="img" [attr.aria-label]="label()">{{ digit() }}</span>`,
})
export class SeverityTileComponent {
  readonly level = input.required<IncidentLevel>();
  readonly tone = input.required<StatusTone>();
  readonly major = input(false);
  protected readonly digit = computed(() => LEVEL_DIGIT[this.level()]);
  protected readonly toneClass = computed(() => SEVERITY_TILE_TONE[this.tone()]);
  protected readonly label = computed(
    () => `${INCIDENT_LEVEL_LABELS[this.level()]}${this.major() ? ', declared major' : ''}`,
  );
}
```

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: add severity-tile component"`

### Task 1.3: `kpi-tile` component

**Files:** Create `kpi-tile/kpi-tile.ts` + `.spec.ts`.

- [ ] **Step 1 — Write failing test:** set `label='Overdue'`, `value=1`, `tone='going'`, `emphasis=true`, `live=true`; assert the value text `1`, a `role="status"` element present (because `live`), accent class `bg-status-going` on the spine element, and axe clean. Second case `link='/incidents'` renders an `<a>` (RouterTesting) not a `<div>`.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:**

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type StatusTone } from '@workspace/shared-domain';
import { SPINE_TONE } from '../../ui/tone-classes';

@Component({
  selector: 'app-kpi-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    @let body = '';
    @if (link()) {
      <a [routerLink]="link()" class="relative block overflow-hidden rounded-card border border-outline-variant bg-surface-container-low p-3.5 no-underline focus-visible:outline-2">
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <div class="relative overflow-hidden rounded-card border border-outline-variant bg-surface-container-low p-3.5">
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }
    <ng-template #content>
      <span class="absolute inset-y-0 left-0 w-[3px]" [class]="spineClass()" aria-hidden="true"></span>
      <span class="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">{{ label() }}</span>
      <span class="mt-1 block font-mono text-2xl leading-none tabular-nums text-on-surface"
            [attr.role]="live() ? 'status' : null">{{ value() }}<span class="text-xs text-on-surface-variant">{{ unit() ? ' ' + unit() : '' }}</span></span>
    </ng-template>
  `,
})
export class KpiTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly unit = input('');
  readonly tone = input<'accent' | StatusTone>('accent');
  readonly emphasis = input(false);
  readonly link = input<string | undefined>(undefined);
  readonly live = input(false);
  protected readonly spineClass = computed(() => {
    const t = this.tone();
    return t === 'accent' ? 'bg-primary' : SPINE_TONE[t];
  });
}
```

> Note: import `NgTemplateOutlet` in `imports` (`@angular/common`) for `[ngTemplateOutlet]`.

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: add kpi-tile component"`

### Task 1.4: `cadence-countdown` component

**Files:** Create `cadence-countdown/cadence-countdown.ts` + `.spec.ts`.

- [ ] **Step 1 — Write failing test** (deterministic `now`): `now = new Date('2026-05-31T12:00:00Z')`. Cases: `due=null` → text `—`, state `none`; `due` 6 min in the past → text `−6m`, host has `data-state="overdue"` and a `role="status"`; `due` 14 min ahead → text `in 14m`, state `soon`; `due` 100 min ahead → `in 1h 40m`, state `upcoming`. axe clean.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:**

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MS_PER_HOUR, MS_PER_MINUTE } from '@workspace/shared-domain';

type CadenceState = 'overdue' | 'soon' | 'upcoming' | 'none';
const SOON_MS = 60 * MS_PER_MINUTE;

function fmt(ms: number): string {
  if (ms < MS_PER_HOUR) return `${Math.round(ms / MS_PER_MINUTE)}m`;
  const h = Math.floor(ms / MS_PER_HOUR);
  const m = Math.round((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  return m ? `${h}h ${m}m` : `${h}h`;
}

@Component({
  selector: 'app-cadence-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'state()' },
  template: `<span class="font-mono tabular-nums" [class.text-status-going]="state()==='overdue'"
      [class.text-status-contained]="state()==='soon'" [attr.role]="state()==='overdue' ? 'status' : null">{{ text() }}</span>`,
})
export class CadenceCountdownComponent {
  readonly due = input.required<Date | null>();
  readonly now = input<Date>(new Date());
  protected readonly state = computed<CadenceState>(() => {
    const due = this.due();
    if (due == null) return 'none';
    const delta = due.getTime() - this.now().getTime();
    if (delta < 0) return 'overdue';
    if (delta <= SOON_MS) return 'soon';
    return 'upcoming';
  });
  protected readonly text = computed(() => {
    const due = this.due();
    if (due == null) return '—';
    const delta = due.getTime() - this.now().getTime();
    return delta < 0 ? `−${fmt(-delta)}` : `in ${fmt(delta)}`;
  });
}
```

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: add cadence-countdown component"`

### Task 1.5: `status-mix-bar` component

**Files:** Create `status-mix-bar/status-mix-bar.ts` + `.spec.ts`.

- [ ] **Step 1 — Write failing test:** `counts` with `going:3, contained:1, underControlFirst:1, safe:1` (others 0). Assert: 4 segment elements rendered, the going segment width style `50%`, a legend listing tone labels with counts, role `img`/`group` with an `aria-label` summarising counts, axe clean.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:**

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type FireStatus, FIRE_STATUS_VALUES, type StatusTone, statusTone } from '@workspace/shared-domain';
import { SPINE_TONE } from '../../ui/tone-classes';

interface Segment { tone: StatusTone; count: number; pct: number; label: string; class: string; }
const TONE_LABEL: Readonly<Record<StatusTone, string>> = {
  going: 'Going', contained: 'Contained', controlled: 'Under control', safe: 'Safe', neutral: 'Resolved', missing: 'Not found',
};
const TONE_ORDER: readonly StatusTone[] = ['going', 'contained', 'controlled', 'safe', 'missing', 'neutral'];

@Component({
  selector: 'app-status-mix-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-3 overflow-hidden rounded-field" role="img" [attr.aria-label]="summary()">
      @for (s of segments(); track s.tone) { <span [class]="s.class" [style.width.%]="s.pct"></span> }
    </div>
    <dl class="mt-2.5 grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-xs text-on-surface-variant">
      @for (s of segments(); track s.tone) {
        <div class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-[3px]" [class]="s.class" aria-hidden="true"></span>
          <dt>{{ s.label }}</dt><dd class="ml-auto font-mono text-on-surface">{{ s.count }}</dd></div>
      }
    </dl>`,
})
export class StatusMixBarComponent {
  readonly counts = input.required<Readonly<Record<FireStatus, number>>>();
  protected readonly segments = computed<readonly Segment[]>(() => {
    const c = this.counts();
    const byTone = new Map<StatusTone, number>();
    for (const s of FIRE_STATUS_VALUES) {
      const n = c[s] ?? 0;
      if (n > 0) byTone.set(statusTone(s), (byTone.get(statusTone(s)) ?? 0) + n);
    }
    const total = [...byTone.values()].reduce((a, b) => a + b, 0) || 1;
    return TONE_ORDER.filter((t) => byTone.has(t)).map((t) => ({
      tone: t, count: byTone.get(t)!, pct: ((byTone.get(t)! / total) * 100),
      label: TONE_LABEL[t], class: SPINE_TONE[t],
    }));
  });
  protected readonly summary = computed(
    () => this.segments().map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ') || 'No active incidents',
  );
}
```

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: add status-mix-bar component"`

### Task 1.6: `isTerminalStatus` util (§A.11.2)

**Files:** Create `apps/web/src/app/shared/util/fire-status.ts` + `fire-status.spec.ts`.

- [ ] **Step 1 — Write failing test:** `isTerminalStatus(FireStatus.safe)` → `true`; `isTerminalStatus(FireStatus.going)` → `false`; assert `true` for every member of `TERMINAL_STATUSES` and `false` for `FireStatus.going`/`contained`/`underControlFirst`/`underControlSecond`.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:**

```ts
import { type FireStatus, TERMINAL_STATUSES } from '@workspace/shared-domain';

export function isTerminalStatus(s: FireStatus): boolean {
  return (TERMINAL_STATUSES as readonly FireStatus[]).includes(s);
}
```

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: add isTerminalStatus util"`

- [ ] **Phase 1 gate:** `bun run check:ci` → pass.

---

## Phase 2 — App shell, routing & focus management

**Outcome:** Overview is the default landing route with a nav entry; shell restyled to the tactical chrome; route changes move focus accessibly.

### Task 2.1: Routes — default to Overview, add lazy route

**Files:** Modify `apps/web/src/app/app.routes.ts`.

- [ ] **Step 1 — Edit routes verbatim:**

```ts
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: 'overview', loadComponent: () => import('./features/overview/overview').then((m) => m.OverviewComponent), data: { width: 'wide' } },
  { path: 'incidents', loadChildren: () => import('./features/fire-incidents/fire-incidents.routes').then((m) => m.fireIncidentRoutes) },
];
```

- [ ] **Step 2 — Create the component first.** The lazy `loadComponent` import resolves only once `overview.ts` exists, so complete **Task 3.1 Steps 1–3** (the `OverviewComponent` skeleton) now, then return here.
- [ ] **Step 3 — Build check + commit.** Run `bun run check:ci` → pass, then `git add apps/web/src/app/app.routes.ts apps/web/src/app/features/overview && git commit -m "web: land on /overview by default, lazy-load dashboard"`

### Task 2.2: Sidenav — add Overview nav item

**Files:** Modify `apps/web/src/app/app.html`.

- [ ] **Step 1 — Add an Overview link** as the first child of `<mat-nav-list>` in the `Operations` nav, before the existing Incidents link:

```html
<a mat-list-item routerLink="/overview" routerLinkActive #overviewLink="routerLinkActive" [activated]="overviewLink.isActive">
  <mat-icon matListItemIcon aria-hidden="true">insights</mat-icon>
  <span matListItemTitle>Overview</span>
</a>
```

- [ ] **Step 2 — Verify** the existing Incidents link is unchanged and the `nav aria-label="Primary"` + `Operations` section header remain.
- [ ] **Step 3 — Format + commit.** `bun run format:html` then `git add apps/web/src/app/app.html && git commit -m "web: add Overview nav item to sidenav"`

### Task 2.3: Route-change focus management (SC 2.4.3 / 2.4.11)

**Files:** Modify `apps/web/src/app/app.ts`, `apps/web/src/app/app.css`.

- [ ] **Step 1 — Write failing test** (`app.spec.ts`): after a router navigation to `/incidents` and `await fixture.whenStable()`, assert `document.activeElement` is the `#main` element (id `main`). (Use `provideRouter(routes)` test harness + `Router.navigateByUrl`.)
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement** in `app.ts`: inject `DestroyRef`; in the constructor subscribe to `router.events` filtered to `NavigationEnd` (via `takeUntilDestroyed()`), and in the handler call `afterNextRender`-equivalent focus: `queueMicrotask(() => document.getElementById('main')?.focus())`. Keep the existing `contentWidth` toSignal. In `app.css` add `.main { scroll-margin-top: 4rem; }` (SC 2.4.11 under the sticky appbar) and ensure `.main:focus-visible` shows no distracting outline (it already has `outline: none` + `tabindex=-1`; that's acceptable since focus is programmatic and the heading is visible).
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: move focus to main content on route change"`

### Task 2.4: Shell chrome restyle (tactical density)

**Files:** Modify `apps/web/src/app/app.css`.

- [ ] **Step 1 — Restyle** within `app.css` using ONLY `--mat-sys-*`/`--app-*` tokens (no hex): set `.sidenav` background to `var(--mat-sys-surface-container-low)`, widen to `15rem`; `.appbar` already `surface-container`; tighten `.nav a` padding; the `.userchip__avatar` uses `var(--mat-sys-primary)`/`var(--mat-sys-on-primary)`. Add a `--container-wide` content width already exists. Keep `.skip-link`, focus ring, landmark structure.
- [ ] **Step 2 — Verify budget.** Confirm `app.css` < 8 kB.
- [ ] **Step 3 — Commit.** `git commit -m "web: tighten shell chrome for command-centre density"`

- [ ] **Phase 2 gate:** `bun run check:ci` → pass; Playwright check nav highlights Overview/Incidents correctly, focus moves on navigation.

---

## Phase 3 — Operations dashboard (`/overview`)

**Outcome:** A scale-safe, role-scoped operations dashboard implementing §A.11.4: live operational KPIs / needs-attention / status-mix / map over the *active* set via server-side `count`/`aggregate`/`groupBy` + bounded `liveQuery`/`find` (never a wholesale load — peak season is hundreds active), an FY-scoped **Season** panel, and an elevated **by-region** rollup, refreshed on a 60 s tick. No new backend.

### Task 3.1: `OverviewComponent` skeleton + states

**Files:** Create `apps/web/src/app/features/overview/overview.ts` + `overview.spec.ts`.

- [ ] **Step 1 — Write failing test:** render `OverviewComponent` with `DevAuthService` stubbed to an `undefined` user → assert the `anonymous` message renders and no Remult query is issued; then with an admin user + `InMemoryDataProvider` seeded with **zero active** incidents → after `await fixture.whenStable()` + `TestBed.tick()` assert `viewState()` is `content`, the operational section shows the inline "No active incidents right now." note, and the Season panel renders. `findAxeViolations` empty. (Provide `remult` via the InMemory provider per testing/config conventions.)
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement skeleton** (data layer + states; template filled in 3.2/3.3):

```ts
import {
  ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ResultAsync } from 'neverthrow';
import { type EntityFilter, remult } from 'remult';
import {
  computeFinancialYear, District, FireIncident, type FireStatus, FIRE_STATUS_VALUES, FireStatus as FS,
  type IncidentLevel, INCIDENT_LEVEL_LABELS, LEVEL_ORDER, operatorName, SituationReport,
  type StatusTone, statusTone, TERMINAL_STATUSES,
} from '@workspace/shared-domain';
import { DevAuthService } from '../../core/dev-auth.service';
import { canCreateIncident, canViewDistrictRollup } from '../../shared/auth/permissions';
import type { MapPoint } from '../../shared/ui/tone-classes';

const TICK_MS = 60_000;          // re-run server aggregates each minute (active set is server-derived)
const MAP_CAP = 500;             // bounded map fetch (peak season can be hundreds active)
const ATTENTION_LIMIT = 10;      // bounded live needs-attention list
const SITREP_LIMIT = 8;          // bounded live activity feed
const FIRST_SEASON_FY = 2018;    // earliest seeded financial year
const ACTIVE: EntityFilter<FireIncident> = { status: { $nin: [...TERMINAL_STATUSES] } };
const toErr = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

interface RegionRow { regionId: number; regionName: string; count: number; }

@Component({
  selector: 'app-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule, MatProgressBarModule /* + tiles/badges/map added in 3.2/3.3 */],
  templateUrl: './overview.html',
})
export class OverviewComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly currentUser = this.devAuth.currentUser;
  protected readonly canCreate = computed(() => canCreateIncident(this.currentUser()));
  protected readonly showRollup = computed(() => canViewDistrictRollup(this.currentUser()));
  protected readonly now = signal(new Date());

  // Operational (active) — SERVER-derived (count/aggregate/groupBy); never a wholesale load.
  protected readonly activeCount = signal(0);
  protected readonly goingCount = signal(0);
  protected readonly majorCount = signal(0);
  protected readonly overdueCount = signal(0);
  protected readonly totalActiveAreaHa = signal(0);
  protected readonly statusCounts = signal<Readonly<Record<FireStatus, number>>>(this.zeroCounts());
  protected readonly mapPoints = signal<readonly MapPoint[]>([]);
  protected readonly mapOverflow = signal(0);
  protected readonly opsLoaded = signal(false);

  // Bounded LIVE sets.
  protected readonly attention = signal<FireIncident[]>([]);
  protected readonly recentSitreps = signal<SituationReport[]>([]);

  // Season (selected FY) — SERVER-derived.
  protected readonly selectedFy = signal<number>(computeFinancialYear(new Date()));
  protected readonly fyOptions = computed(() => {
    const cur = computeFinancialYear(new Date());
    return Array.from({ length: cur - FIRST_SEASON_FY + 1 }, (_, i) => cur - i);
  });
  protected readonly seasonCount = signal(0);
  protected readonly seasonAreaHa = signal(0);
  protected readonly seasonStatus = signal<Readonly<Record<FireStatus, number>>>(this.zeroCounts());
  protected readonly regionRollup = signal<readonly RegionRow[]>([]);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly viewState = computed<'anonymous' | 'loading' | 'content'>(() => {
    if (!this.currentUser()) return 'anonymous';
    return this.opsLoaded() ? 'content' : 'loading';
  });

  // Re-sort the bounded live list by urgency against the ticking clock.
  protected readonly needsAttention = computed(() => {
    const t = this.now().getTime();
    const overdueBy = (i: FireIncident) => (i.nextReportDue ? t - i.nextReportDue.getTime() : Number.NEGATIVE_INFINITY);
    return [...this.attention()].sort((a, b) => {
      if (overdueBy(a) !== overdueBy(b)) return overdueBy(b) - overdueBy(a);
      if ((a.status === FS.going ? 1 : 0) !== (b.status === FS.going ? 1 : 0)) return a.status === FS.going ? -1 : 1;
      if (LEVEL_ORDER[a.incidentLevel] !== LEVEL_ORDER[b.incidentLevel]) return LEVEL_ORDER[b.incidentLevel] - LEVEL_ORDER[a.incidentLevel];
      return (b.isMajor ? 1 : 0) - (a.isMajor ? 1 : 0);
    });
  });

  private unsubAttention: (() => void) | null = null;
  private unsubSitreps: (() => void) | null = null;

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    // Live bounded subscriptions — re-subscribe on user change only.
    effect(() => {
      const id = this.currentUser()?.id;
      this.unsubAttention?.(); this.unsubSitreps?.();
      this.unsubAttention = null; this.unsubSitreps = null;
      if (!id) { this.attention.set([]); this.recentSitreps.set([]); return; }
      this.unsubAttention = remult.repo(FireIncident)
        .liveQuery({ where: ACTIVE, orderBy: { nextReportDue: 'asc' }, limit: ATTENTION_LIMIT, include: { district: true } })
        .subscribe((info) => this.attention.set(info.items));
      this.unsubSitreps = remult.repo(SituationReport)
        .liveQuery({ orderBy: { submittedAt: 'desc' }, limit: SITREP_LIMIT })
        .subscribe((info) => this.recentSitreps.set(info.items));
    });
    this.destroyRef.onDestroy(() => { this.unsubAttention?.(); this.unsubSitreps?.(); });
    // Operational aggregates — refresh on user change + tick.
    effect(() => { const u = this.currentUser(); this.now(); if (u) void this.refreshOps(); else this.opsLoaded.set(false); });
    // Season aggregates — refresh on user change + FY change.
    effect(() => { const u = this.currentUser(); this.selectedFy(); if (u) void this.refreshSeason(); });
  }

  protected setFy(fy: number): void { this.selectedFy.set(fy); }
  protected authorName(id: string): string { return operatorName(id); }
  protected tone(s: FireStatus): StatusTone { return statusTone(s); }
  protected levelLabel(l: IncidentLevel): string { return INCIDENT_LEVEL_LABELS[l]; }
  private zeroCounts(): Record<FireStatus, number> {
    return Object.fromEntries(FIRE_STATUS_VALUES.map((s) => [s, 0])) as Record<FireStatus, number>;
  }

  private async refreshOps(): Promise<void> {
    const repo = remult.repo(FireIncident);
    const now = untracked(() => this.now());
    const result = await ResultAsync.fromPromise(Promise.all([
      repo.groupBy({ group: ['status'], where: ACTIVE }),
      repo.aggregate({ sum: ['fireAreaHectares'], where: ACTIVE }),
      repo.count({ ...ACTIVE, isMajor: true }),
      repo.count({ ...ACTIVE, nextReportDue: { $lt: now } }),
      repo.count(ACTIVE),
      repo.find({ where: ACTIVE, orderBy: { statusAsAt: 'desc' }, limit: MAP_CAP, select: { id: true, name: true, latitude: true, longitude: true, status: true } }),
    ]), toErr);
    result.match(([statusRows, areaAgg, major, overdue, active, rows]) => {
      const counts = this.zeroCounts();
      let going = 0;
      for (const r of statusRows) { counts[r.status] = r.$count; if (r.status === FS.going) going = r.$count; }
      this.statusCounts.set(counts);
      this.goingCount.set(going);
      this.activeCount.set(active);
      this.majorCount.set(major);
      this.overdueCount.set(overdue);
      this.totalActiveAreaHa.set(areaAgg.fireAreaHectares.sum ?? 0);
      this.mapPoints.set(rows.filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({ lat: r.latitude!, lng: r.longitude!, tone: statusTone(r.status), name: r.name })));
      this.mapOverflow.set(Math.max(0, active - rows.length));
      this.errorMsg.set(null);
      this.opsLoaded.set(true);
    }, (e) => { this.errorMsg.set(e.message); this.opsLoaded.set(true); });
  }

  private async refreshSeason(): Promise<void> {
    const repo = remult.repo(FireIncident);
    const where: EntityFilter<FireIncident> = { financialYear: this.selectedFy() };
    const elevated = untracked(() => this.showRollup());
    const result = await ResultAsync.fromPromise(Promise.all([
      repo.aggregate({ sum: ['fireAreaHectares'], where }),
      repo.groupBy({ group: ['status'], where }),
      elevated ? repo.groupBy({ group: ['districtId'], where, orderBy: { $count: 'desc' } }) : Promise.resolve([] as { districtId: number; $count: number }[]),
      elevated ? remult.repo(District).find({ limit: 50 }) : Promise.resolve([] as District[]),
    ]), toErr);
    result.match(([areaAgg, statusRows, districtRows, districts]) => {
      this.seasonCount.set(areaAgg.$count);
      this.seasonAreaHa.set(areaAgg.fireAreaHectares.sum ?? 0);
      const counts = this.zeroCounts();
      for (const r of statusRows) counts[r.status] = r.$count;
      this.seasonStatus.set(counts);
      const dmap = new Map(districts.map((d) => [d.id, d]));
      const byRegion = new Map<number, RegionRow>();
      for (const r of districtRows) {
        const d = dmap.get(r.districtId);
        if (!d) continue;
        const row = byRegion.get(d.regionId) ?? { regionId: d.regionId, regionName: d.regionName, count: 0 };
        row.count += r.$count; byRegion.set(d.regionId, row);
      }
      this.regionRollup.set([...byRegion.values()].sort((a, b) => b.count - a.count));
    }, (e) => this.errorMsg.set(e.message));
  }
}
```

> `MapPoint` (`{ lat; lng; tone: StatusTone; name }`) is defined ONCE in `apps/web/src/app/shared/ui/tone-classes.ts` (Phase 1 Task 1.1) and imported by both this component and `incident-map`. Remult `groupBy` rows are typed `{ status: FireStatus; $count: number }` / `{ districtId: number; $count: number }`; `aggregate` returns `{ $count: number; fireAreaHectares: { sum: number | null } }`.

Create `overview.html` with `@switch (viewState())`: `anonymous` ("Select a dev user to begin."), `loading` (`<mat-progress-bar aria-label="Loading dashboard">`), `content`. Root is `<h1 tabindex="-1">Operations overview</h1>` then sections (filled in 3.2/3.3). The shell provides `<main>`. When `activeCount() === 0`, the operational section shows an inline "No active incidents" note but the Season panel still renders.

- [ ] **Step 4 — Run, expect pass** (anonymous + content states). Then return to Task 2.1 Step 2/3 and commit routes.
- [ ] **Step 5 — Commit.** `git commit -m "web: scaffold operations dashboard with view states"`

### Task 3.2: Operational template (KPIs, status-mix, needs-attention, activity, map)

**Files:** Modify `overview.html`, `overview.ts` (imports), `overview.spec.ts`.

> All values come from the Task 3.1 SERVER-derived signals — no client reduce over a wholesale set.

- [ ] **Step 1 — Write failing test:** seed `InMemoryDataProvider` (small representative set): incident A `going` L3 `isMajor`, `nextReportDue` 6 min before a fixed `now`, area 1240, with lat/long; B `contained` L2 area 380 with lat/long; C `safe` (terminal) area 12. Admin user. After `await fixture.whenStable()` + `TestBed.tick()`, assert: five `app-kpi-tile`; the Overdue tile has a `role="status"` node; the Active tile shows `2`; an `app-status-mix-bar`; the needs-attention list's first `<a [routerLink]="['/incidents', …]">` is incident A; an `app-incident-map`; a recent-activity region; `expect(await findAxeViolations(fixture.nativeElement)).toEqual([])`.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement** the operational portion of `overview.html` `content` branch, binding the 3.1 signals: a KPI strip of `app-kpi-tile` — Active (`[value]="activeCount()"`, `tone="accent"`), Going (`[value]="goingCount()"`, `tone` = `goingCount() ? 'going' : 'neutral'`), Major (`[value]="majorCount()"`, `tone` = `majorCount() ? 'going' : 'neutral'`), Overdue (`[value]="overdueCount()"`, `tone` = `overdueCount() ? 'going' : 'neutral'`, `[live]="true"`), Area burning (`[value]="totalActiveAreaHa()"`, `unit="ha"`, `tone="accent"`); `<app-status-mix-bar [counts]="statusCounts()" />`; a needs-attention `<ul>` of `<a [routerLink]="['/incidents', i.id]">` rows (`app-severity-tile` + name + `i.district?.name` + `app-status-badge [status]="i.status"` + `app-cadence-countdown [due]="isTerminalStatus(i.status) ? null : (i.nextReportDue ?? null)" [now]="now()"`) over `needsAttention()`; a recent-activity `<ol>` over `recentSitreps()` (each `<a [routerLink]="['/incidents', s.fireIncidentId]">`: `s.fireName` + `app-status-badge` + `report {{ s.reportNumber }}` + `by {{ authorName(s.submittedBy) }}` + `{{ s.submittedAt | date:'dd/MM/yy, HH:mm' }}`); and `@defer (on viewport; prefetch on idle) { <app-incident-map [points]="mapPoints()" /> } @placeholder { <div data-testid="overview-map-placeholder">Map — scroll to load.</div> }` with `@if (mapOverflow()) { <p>+{{ mapOverflow() }} more active not plotted</p> }`. When `activeCount() === 0` show an inline "No active incidents right now." note in place of the attention list. Each block is a `<section>` with `aria-labelledby` a heading id. Add imports: `KpiTileComponent`, `StatusMixBarComponent`, `SeverityTileComponent`, `CadenceCountdownComponent`, `StatusBadgeComponent`, `IncidentMapComponent`, `DatePipe`, and `isTerminalStatus` from `../../shared/util/fire-status` (§A.11.2).
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: operational dashboard surface"`

### Task 3.3: Season panel + region rollup

**Files:** Modify `overview.html`, `overview.ts` (imports), `overview.spec.ts`.

- [ ] **Step 1 — Write failing test:** seed FY2026 with three fires (one terminal) across two districts in different regions, and FY2025 with two fires. Admin user, default FY (2026): after `whenStable` + `TestBed.tick()`, assert the Season heading shows the selected FY, season total = 3, an `app-status-mix-bar` for `seasonStatus()`, and a region rollup region listing the two region names with counts; switching FY via `setFy(2025)` (call the method or drive the select) updates the season total to 2. Assert the region rollup region is ABSENT for a `viewer` user. `findAxeViolations` empty.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement** a Season `<section aria-labelledby="season-h">`: an FY `<select>` (or `<mat-select aria-label="Financial year">`) over `fyOptions()` bound to `selectedFy()` / `(change)="setFy(...)"`; two `app-kpi-tile` (Fires this season `[value]="seasonCount()"` tone accent; Area burnt `[value]="seasonAreaHa()"` unit `ha` tone accent); `<app-status-mix-bar [counts]="seasonStatus()" />`; and `@if (showRollup()) { <section aria-labelledby="region-h"> … a list/`<dl>` over `regionRollup()` (region name + mono `count`) … </section> }`. Mono/`tabular-nums` for all figures. (Season figures use the Task 3.1 `seasonCount`/`seasonAreaHa`/`seasonStatus`/`regionRollup` signals.)
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Real-browser check** (Playwright): dashboard renders rich in both themes; Overdue `role=status`; FY selector switches the season panel; keyboard tab order; axe color-contrast 0.
- [ ] **Step 6 — Commit.** `git commit -m "web: dashboard season panel + region rollup"`

- [ ] **Phase 3 gate:** `bun run check:ci` → pass.

---

## Phase 4 — Severity-forward, server-paginated incident list

**Outcome:** Implements §A.11.3 — the list never loads the table client-side (13.5k rows; peak season far higher). Filters (financial year [default current], status group, district [elevated]) + `MatSort` drive a server-paginated `liveQuery`; the paginator total comes from `repo.count(where)`. Rows read severity-first (severity tile, status spine, status badge, terminal-aware cadence, area bar) with a persisted Comfortable/Compact density toggle. `aria-label="Fire incidents"`, the 9 displayed columns, `canCreate` gate, and `aria-live` count are kept; the `district` column sorts server-side by `districtId`.

### Task 4.1: Filters + server pagination (data layer)

**Files:** Rewrite `incident-list.ts`; rewrite `incident-list.spec.ts`.

- [ ] **Step 1 — Write failing test:** `InMemoryDataProvider` seeded with, e.g., 30 fires across two financial years and two statuses. Admin user. Assert: default `filters().fy` = `computeFinancialYear(new Date())`; `total()` equals the server count for the default filter (a `repo.count` spy/result), `rows().length <= pageState().pageSize`; calling `setStatusGroup('going')` resets `pageState().pageIndex` to 0 and re-queries with `where.status = FireStatus.going`; `onPage({pageIndex:1,pageSize:25})` fetches page 2 (different rows); `viewState()` is `empty` when the count is 0. Assert via the seeded `InMemoryDataProvider` results after `await fixture.whenStable()` + `TestBed.tick()` (read `total()`/`rows()`/`filters()`/`pageState()` signals).
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement `incident-list.ts`:**

```ts
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { type EntityFilter, type EntityOrderBy, remult } from 'remult';
import { ResultAsync } from 'neverthrow';
import {
  computeFinancialYear, District, FireIncident, FireStatus, type IncidentLevel,
  INCIDENT_LEVEL_LABELS, type StatusTone, statusTone, TERMINAL_STATUSES,
} from '@workspace/shared-domain';
import { DevAuthService } from '../../../core/dev-auth.service';
import { canCreateIncident, canViewDistrictRollup } from '../../../shared/auth/permissions';

type StatusGroup = 'all' | 'active' | 'going' | 'resolved';
type SortKey = 'name' | 'fireNumber' | 'statusAsAt' | 'districtId' | 'createdAt';
interface ListFilters { fy: number | 'all'; group: StatusGroup; districtId: number | 'all'; }
interface SortState { active: SortKey; direction: 'asc' | 'desc' | ''; }
interface PageState { pageIndex: number; pageSize: number; }
type ViewState = 'anonymous' | 'loading' | 'error' | 'empty' | 'content';
const DEFAULT_PAGE_SIZE = 25;
const FIRST_SEASON_FY = 2018;
const toErr = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

@Component({
  selector: 'app-incident-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [/* Mat*, Router, app-status-badge, app-severity-tile, app-cadence-countdown (added in 4.2–4.5) */],
  templateUrl: './incident-list.html',
  styleUrl: './incident-list.css',
})
export class IncidentListComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly displayedColumns = ['name', 'district', 'fireNumber', 'status', 'fireAreaHectares', 'incidentLevel', 'isMajor', 'statusAsAt', 'nextReportDue'] as const;
  protected readonly currentUser = this.devAuth.currentUser;
  protected readonly canCreate = computed(() => canCreateIncident(this.currentUser()));
  protected readonly showDistrictFilter = computed(() => canViewDistrictRollup(this.currentUser()));
  protected readonly isHandset = toSignal(this.breakpoints.observe(Breakpoints.Handset).pipe(map((r) => r.matches)), { initialValue: false });
  protected readonly now = signal(new Date());

  protected readonly filters = signal<ListFilters>({ fy: computeFinancialYear(new Date()), group: 'all', districtId: 'all' });
  protected readonly sortState = signal<SortState>({ active: 'createdAt', direction: 'desc' });
  protected readonly pageState = signal<PageState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  protected readonly fyOptions = computed<(number | 'all')[]>(() => {
    const c = computeFinancialYear(new Date());
    return ['all', ...Array.from({ length: c - FIRST_SEASON_FY + 1 }, (_, i) => c - i)];
  });
  protected readonly districtOptions = signal<{ id: number; name: string }[]>([]);

  protected readonly rows = signal<FireIncident[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly viewState = computed<ViewState>(() => {
    if (!this.currentUser()) return 'anonymous';
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.total() === 0 ? 'empty' : 'content';
  });
  protected readonly maxArea = computed(() => Math.max(1, ...this.rows().map((r) => r.fireAreaHectares ?? 0)));

  private readonly whereKey = computed(() => JSON.stringify(this.filters()));
  private unsubscribe: (() => void) | null = null;

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    // District options for the elevated district filter.
    effect(() => {
      if (!this.showDistrictFilter() || !this.currentUser()) { this.districtOptions.set([]); return; }
      void ResultAsync.fromPromise(remult.repo(District).find({ limit: 50 }), toErr)
        .match((ds) => this.districtOptions.set(ds.map((d) => ({ id: d.id, name: d.name }))), () => this.districtOptions.set([]));
    });
    // Total — refetch on user + filters.
    effect(() => {
      const id = this.currentUser()?.id; this.whereKey();
      if (!id) { this.total.set(0); return; }
      const where = untracked(() => this.buildWhere());
      void ResultAsync.fromPromise(remult.repo(FireIncident).count(where), toErr)
        .match((n) => { this.total.set(n); this.error.set(null); }, (e) => this.error.set(e.message));
    });
    // Page rows — re-subscribe on user + filters + sort + page.
    effect(() => {
      const id = this.currentUser()?.id; this.whereKey(); const sort = this.sortState(); const page = this.pageState();
      this.unsubscribe?.(); this.unsubscribe = null;
      if (!id) { this.rows.set([]); this.loading.set(false); return; }
      this.loading.set(true);
      const where = untracked(() => this.buildWhere());
      this.unsubscribe = remult.repo(FireIncident).liveQuery({
        where, include: { district: true }, orderBy: this.mapSort(sort), limit: page.pageSize, page: page.pageIndex + 1,
      }).subscribe((info) => { this.rows.set(info.items); this.loading.set(false); });
    });
    this.destroyRef.onDestroy(() => this.unsubscribe?.());
  }

  protected onSortChange(s: { active: string; direction: 'asc' | 'desc' | '' }): void {
    this.sortState.set({ active: s.active as SortKey, direction: s.direction });
    this.pageState.update((p) => ({ ...p, pageIndex: 0 }));
  }
  protected onPage(e: { pageIndex: number; pageSize: number }): void { this.pageState.set({ pageIndex: e.pageIndex, pageSize: e.pageSize }); }
  protected setFy(fy: number | 'all'): void { this.filters.update((f) => ({ ...f, fy })); this.pageState.update((p) => ({ ...p, pageIndex: 0 })); }
  protected setStatusGroup(group: StatusGroup): void { this.filters.update((f) => ({ ...f, group })); this.pageState.update((p) => ({ ...p, pageIndex: 0 })); }
  protected setDistrict(districtId: number | 'all'): void { this.filters.update((f) => ({ ...f, districtId })); this.pageState.update((p) => ({ ...p, pageIndex: 0 })); }
  protected tone(s: FireStatus): StatusTone { return statusTone(s); }
  protected levelLabel(l: IncidentLevel): string { return INCIDENT_LEVEL_LABELS[l]; }
  protected areaPct(i: FireIncident): number { return Math.min(100, ((i.fireAreaHectares ?? 0) / this.maxArea()) * 100); }

  private buildWhere(): EntityFilter<FireIncident> {
    const f = this.filters();
    const where: EntityFilter<FireIncident> = {};
    if (f.fy !== 'all') where.financialYear = f.fy;
    if (f.group === 'active') where.status = { $nin: [...TERMINAL_STATUSES] };
    else if (f.group === 'going') where.status = FireStatus.going;
    else if (f.group === 'resolved') where.status = { $in: [...TERMINAL_STATUSES] };
    if (f.districtId !== 'all') where.districtId = f.districtId;
    return where;
  }
  private mapSort(sort: SortState): EntityOrderBy<FireIncident> {
    const dir = sort.direction === '' ? 'desc' : sort.direction;
    switch (sort.active) {
      case 'name': return { name: dir };
      case 'fireNumber': return { fireNumber: dir };
      case 'statusAsAt': return { statusAsAt: dir };
      case 'districtId': return { districtId: dir };
      default: return { createdAt: 'desc' };
    }
  }
}
```

> The list now uses an external `incident-list.css` (the previous inline `styles` is replaced; keeps the 8 kB budget). `incident-list.spec.ts` is rewritten for server pagination (no client-slice assertions).

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: server-paginate + filter the incident list"`

### Task 4.2: Filter bar, sort & paginator template

**Files:** Modify `incident-list.html`, `incident-list.ts` (imports), `incident-list.spec.ts`.

- [ ] **Step 1 — Write failing test:** assert a filter bar with: a financial-year `<mat-select aria-label="Financial year">` over `fyOptions()`; a status-group control (`<mat-button-toggle-group aria-label="Status">` All/Active/Going/Resolved); a district `<mat-select aria-label="District">` rendered ONLY when `showDistrictFilter()` (admin yes; viewer no); the `<mat-paginator [length]="total()" [pageSize]="pageState().pageSize" [pageSizeOptions]="[25,50,100]">`; `<table matSort aria-label="Fire incidents">` with `mat-sort-header` on `name`/`fireNumber`/`statusAsAt`/`district`; the `aria-live="polite"` count `{{ total() }} total`. Drive a status-group change via `MatButtonToggleHarness` and assert `setStatusGroup` ran. axe clean.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement** the `@switch (viewState())` shell (`anonymous`/`loading` `<mat-progress-bar aria-label="Loading incidents">`/`error` `role="alert"`/`empty` "No incidents match these filters."/`content`). In `content`: the filter bar (selects/toggles bound to `filters()` via `setFy`/`setStatusGroup`/`setDistrict`), and — when `!isHandset()` — the `MatTable` with `[matSortActive]="sortState().active"`, `[matSortDirection]="sortState().direction"`, `(matSortChange)="onSortChange($event)"`, `*matHeaderRowDef="displayedColumns; sticky: true"`, `mat-sort-header` on `name`/`fireNumber`/`statusAsAt`/`district` (the `district` header uses `matColumnDef="district"` but `mat-sort-header="districtId"` semantics via `onSortChange` mapping). `<mat-paginator [length]="total()" …>`. Header count `<span aria-live="polite">{{ total() }} total</span>` and the `canCreate` CTA `<a matButton="filled" routerLink="/incidents/new">`. Add `MatTableModule`, `MatSortModule`, `MatPaginatorModule`, `MatSelectModule`, `MatButtonToggleModule`, `MatProgressBarModule`, `MatButtonModule`, `MatIconModule`, `RouterLink`.
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: list filter bar + server paginator"`

### Task 4.3: Severity-forward desktop table cells

**Files:** Modify `incident-list.html`, `incident-list.ts` (imports), `incident-list.css`.

- [ ] **Step 1 — Write failing test:** with a seeded `going` L3 `isMajor` incident in the default FY, assert (via `MatTableHarness` rows + `querySelector`): the row renders `app-severity-tile`, `app-status-badge`, `app-cadence-countdown`; a left status-spine element with class `bg-status-going`; the `nextReportDue` cell for a **terminal** incident shows `—` (cadence `[due]=null`); sort works (`MatSortHarness` click "Name" → `onSortChange`); `aria-label="Fire incidents"` intact; axe clean.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement** the cell templates (keep all 9 `matColumnDef`s):
  - `name`: a flex row with `<span class="status-spine" [class]="SPINE_TONE[tone(i.status)]"></span>`, the name as `<a [routerLink]="['/incidents', i.id]">`, and `@if (i.isMajor) { <span class="major-chip">Major</span> }`.
  - `status`: `<app-status-badge [status]="i.status" />`.
  - `district`: `{{ i.district?.name }}`.
  - `incidentLevel`: `<app-severity-tile [level]="i.incidentLevel" [tone]="tone(i.status)" [major]="i.isMajor" />`.
  - `fireAreaHectares`: `<span class="font-mono tabular-nums">{{ i.fireAreaHectares ?? '—' }}</span>` + `<span class="area-bar"><i [style.width.%]="areaPct(i)"></i></span>`.
  - `nextReportDue`: `<app-cadence-countdown [due]="isTerminalStatus(i.status) ? null : (i.nextReportDue ?? null)" [now]="now()" />`.
  Import `SeverityTileComponent`, `CadenceCountdownComponent`, `StatusBadgeComponent`, `SPINE_TONE` (from `shared/ui/tone-classes`), and `isTerminalStatus` (from `shared/util/fire-status`). In `incident-list.css` add `.status-spine` (3px, full row height), `.area-bar`/`.area-bar i` (token colours via `--color-status-*`/`bg-primary`), `.major-chip`, and `[data-density="compact"] td { padding-block: 0.25rem; }`.
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: severity-forward incident table cells"`

### Task 4.4: Density toggle (persisted)

**Files:** Modify `incident-list.ts`, `incident-list.html`, `incident-list.css`; `incident-list.spec.ts`.

- [ ] **Step 1 — Write failing test:** assert a `<mat-button-toggle-group aria-label="Row density">` (Comfortable/Compact); selecting Compact sets `[attr.data-density]="compact"` on the table wrapper and writes `localStorage['fire-list-density']='compact'`; a fresh component reads it back. Use `MatButtonToggleHarness`.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:** add `protected readonly density = signal<'comfortable' | 'compact'>((localStorage.getItem('fire-list-density') as 'comfortable' | 'compact' | null) ?? 'comfortable');` and `protected setDensity(d: 'comfortable' | 'compact'): void { this.density.set(d); localStorage.setItem('fire-list-density', d); }`. Add the toggle group to the filter bar; bind `[attr.data-density]="density()"` on the table wrapper.
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: persisted list density toggle"`

### Task 4.5: Handset severity cards

**Files:** Modify `incident-list.html`, `incident-list.css`.

- [ ] **Step 1 — Write failing test:** force handset (`BreakpointObserver` stub matched) → assert the card branch renders an `<a class="card" [routerLink]="['/incidents', i.id]">` per row with `app-severity-tile` + `app-status-badge` + `app-cadence-countdown` (terminal-aware `[due]`); the filter bar + paginator still render; axe clean.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement** the `@if (isHandset())` card branch: severity tile left; name + `globalIncidentId` (mono) + `i.district?.name` + reported date; `app-status-badge`; `app-cadence-countdown [due]="isTerminalStatus(i.status) ? null : (i.nextReportDue ?? null)" [now]="now()"`; area bar. The paginator + filter bar remain above.
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: severity-forward handset cards"`

- [ ] **Phase 4 gate:** `bun run check:ci` → pass; Playwright at 1320/390 with the seeded DB: list paginates server-side (page 2 differs), filters narrow results, count is the true total, sort works, compact persists; terminal rows show no countdown.

---

## Phase 5 — Incident detail: map, lifecycle timeline, hero

**Outcome:** A severity hero, instrument stat tiles, a deferred Leaflet map (with SVG fallback + empty state), and an accessible lifecycle timeline — added to the detail page. `resource()` gating, every `can*`, `invoke()`/dialog wiring, the `@defer` final-report panel, and all action `data-testid`s are unchanged.

### Task 5.1: `incident-map` component (Leaflet + SVG fallback + empty state)

**Files:** Create `incident-detail/incident-map/incident-map.ts` + `.spec.ts`.

- [ ] **Step 1 — Write failing test (jsdom):** (a) `points=[]` → empty-state element (`data-testid="map-empty"`) renders, no throw; (b) `points=[{lat:0,lng:0,tone:'going',name:'X'}]` → `hasPoints()` true (0,0 valid), construction does not throw, a `role="region"` container with `aria-label` containing the name; (c) set `tilesFailed` signal → `data-testid="map-svg-fallback"` renders. axe clean. (Leaflet won't render tiles in jsdom — assert structure only.)
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:**

```ts
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect,
  type ElementRef, inject, input, signal, viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import * as L from 'leaflet';
import { MARKER_TONE_CLASS, type MapPoint } from '../../../../shared/ui/tone-classes';
import { ThemeService } from '../../../../core/theme.service';

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_OPTS: L.TileLayerOptions = {
  subdomains: 'abcd', maxZoom: 20,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
  styles: [`
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
  `],
})
export class IncidentMapComponent {
  readonly points = input.required<readonly MapPoint[]>();
  readonly locationDescription = input('');
  readonly singleZoom = input(11);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('mapEl');
  protected readonly tilesFailed = signal(false);
  protected readonly hasPoints = computed(() => this.points().length > 0);
  protected readonly single = computed<MapPoint | null>(() => (this.points().length === 1 ? this.points()[0]! : null));
  protected readonly ariaLabel = computed(() => {
    const n = this.points().length;
    return n === 1 ? `Location of ${this.points()[0]!.name}` : `Map of ${n} active incidents`;
  });
  protected readonly projected = computed(() => {
    const pts = this.points();
    const lats = pts.map((p) => p.lat); const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const sx = maxLng - minLng || 1, sy = maxLat - minLat || 1;
    return pts.map((p) => ({ x: 8 + ((p.lng - minLng) / sx) * 84, y: 8 + ((maxLat - p.lat) / sy) * 84, spine: 'bg-status-' + p.tone }));
  });
  private map: L.Map | null = null;
  private layer: L.TileLayer | null = null;
  private readonly isDark = computed(() => {
    const m = this.theme.theme();
    return m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  constructor() {
    afterNextRender({
      write: () => {
        const el = this.mapEl()?.nativeElement;
        const pts = this.points();
        if (!el || pts.length === 0) return;
        this.map = L.map(el, { attributionControl: true, keyboard: true });
        this.layer = L.tileLayer(this.isDark() ? DARK_TILES : LIGHT_TILES, TILE_OPTS);
        this.layer.on('tileerror', () => this.tilesFailed.set(true));
        this.layer.addTo(this.map);
        for (const p of pts) {
          L.marker([p.lat, p.lng], {
            icon: L.divIcon({ className: 'fire-marker ' + MARKER_TONE_CLASS[p.tone], html: '<span class="fire-marker__dot"></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
            keyboard: true, title: p.name, alt: p.name,
          }).addTo(this.map);
        }
        if (pts.length === 1) this.map.setView([pts[0]!.lat, pts[0]!.lng], this.singleZoom());
        else { const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple)); if (b.isValid()) this.map.fitBounds(b, { padding: [24, 24] }); }
        this.map.invalidateSize();
      },
    });
    effect(() => {
      const dark = this.isDark();
      if (!this.map) return;
      this.layer?.remove();
      this.layer = L.tileLayer(dark ? DARK_TILES : LIGHT_TILES, TILE_OPTS);
      this.layer.on('tileerror', () => this.tilesFailed.set(true));
      this.layer.addTo(this.map);
    });
    this.destroyRef.onDestroy(() => { this.map?.remove(); this.map = null; this.layer = null; });
  }
}
```

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: add Leaflet incident-map with SVG fallback + empty state"`

### Task 5.2: `incident-timeline` component

**Files:** Create `incident-detail/incident-timeline/incident-timeline.ts` + `.spec.ts`.

- [ ] **Step 1 — Write failing test:** build a `FireIncident` (InMemory or plain object cast) with `reportedAt`, `fireStartedAt`, `firstCrewArrivedAt`, `isMajor:true`+`declaredByTimestamp`, `status:'going'`, `nextReportDue` 6 min before `now`; two sitreps. Assert: an `<ol>` with `<li>` per event in chronological order; each has a `<time datetime=…>`; status events render `app-status-badge`; the trailing `nextDue` item has `role="status"` and contains "overdue"; decorative dots are `aria-hidden`; axe clean.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:**

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  type FinalReport, type FireIncident, type FireStatus, FIRE_DETECTION_METHOD_LABELS, FIRE_STATUS_LABELS,
  operatorName, type SituationReport, type StatusTone, statusTone,
} from '@workspace/shared-domain';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge';
import { isTerminalStatus } from '../../../../shared/util/fire-status';

type EventTone = StatusTone | 'event' | 'overdue';
interface TimelineEvent {
  kind: 'started' | 'detected' | 'reported' | 'crewSent' | 'crewArrived' | 'declaredMajor' | 'sitrep' | 'signOff' | 'nextDue';
  at: Date; label: string; tone: EventTone; status?: FireStatus; detail?: string; future?: boolean; overdue?: boolean;
}
const SPINE_EVENT_TONE: Readonly<Record<EventTone, string>> = {
  going: 'bg-status-going', contained: 'bg-status-contained', controlled: 'bg-status-controlled',
  safe: 'bg-status-safe', neutral: 'bg-status-neutral', missing: 'bg-status-missing',
  event: 'bg-status-event', overdue: 'bg-status-going',
};

@Component({
  selector: 'app-incident-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, StatusBadgeComponent],
  template: `
    <ol role="list" class="incident-timeline">
      @for (e of events(); track $index) {
        <li [class.is-overdue]="e.overdue" [attr.role]="e.overdue ? 'status' : null">
          <span class="incident-timeline__dot" [class]="dotClass(e)" aria-hidden="true"></span>
          <div class="incident-timeline__body">
            <span class="incident-timeline__label">{{ e.label }}@if (e.status) { <app-status-badge [status]="e.status" /> }@if (e.overdue) { <span class="sr-only"> (overdue)</span> }</span>
            @if (e.detail) { <span class="incident-timeline__detail">{{ e.detail }}</span> }
          </div>
          <time class="incident-timeline__time font-mono tabular-nums" [attr.datetime]="e.at.toISOString()">{{ e.at | date: 'dd/MM/yy, HH:mm' }}</time>
        </li>
      }
    </ol>
  `,
  styles: [`
    .incident-timeline { list-style: none; margin: 0; padding: 0; }
    .incident-timeline li { display: grid; grid-template-columns: auto 1fr auto; gap: .75rem; padding: .55rem 0; position: relative; }
    .incident-timeline li:not(:last-child)::before { content: ''; position: absolute; left: 6px; top: 1.4rem; bottom: -.55rem; width: 2px; background: var(--mat-sys-outline-variant); }
    .incident-timeline__dot { width: 14px; height: 14px; margin-top: .2rem; border-radius: 9999px; border: 2px solid var(--mat-sys-surface); z-index: 1; }
    .incident-timeline__label { font-weight: 600; display: inline-flex; align-items: center; gap: .5rem; }
    .incident-timeline__detail { display: block; font-size: .8125rem; color: var(--mat-sys-on-surface-variant); }
    .incident-timeline__time { font-size: .8125rem; color: var(--mat-sys-on-surface-variant); white-space: nowrap; }
    .is-overdue .incident-timeline__time { color: var(--color-status-going); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `],
})
export class IncidentTimelineComponent {
  readonly fire = input.required<FireIncident>();
  readonly sitreps = input<readonly SituationReport[]>([]);
  readonly finalReport = input<FinalReport | undefined>(undefined);
  readonly now = input<Date>(new Date());
  protected dotClass(e: TimelineEvent): string { return 'incident-timeline__dot ' + SPINE_EVENT_TONE[e.tone]; }
  protected readonly events = computed<readonly TimelineEvent[]>(() => {
    const f = this.fire();
    const out: TimelineEvent[] = [];
    const push = (at: Date | undefined | null, kind: TimelineEvent['kind'], label: string, tone: EventTone, detail?: string) => {
      if (at) out.push({ at, kind, label, tone, detail });
    };
    push(f.fireStartedAt, 'started', 'Fire started', 'event');
    push(f.fireDetectedAt, 'detected', 'Detected', 'event', f.detectionMethod ? FIRE_DETECTION_METHOD_LABELS[f.detectionMethod] : undefined);
    push(f.reportedAt, 'reported', 'Reported', 'event');
    push(f.firstCrewSentAt, 'crewSent', 'First crew sent', 'event');
    push(f.firstCrewArrivedAt, 'crewArrived', 'First crew arrived', 'event');
    if (f.isMajor) push(f.declaredByTimestamp, 'declaredMajor', 'Declared major', 'going', f.declaredBySource || undefined);
    for (const s of [...this.sitreps()].sort((a, b) => a.reportNumber - b.reportNumber)) {
      if (s.submittedAt) out.push({ at: s.submittedAt, kind: 'sitrep', label: `Situation report ${s.reportNumber} — ${FIRE_STATUS_LABELS[s.status]}`, tone: statusTone(s.status), status: s.status });
    }
    const fr = this.finalReport();
    if (fr?.isSignedOff && fr.signedOffAt) out.push({ at: fr.signedOffAt, kind: 'signOff', label: `Final report signed off by ${operatorName(fr.signedOffBy)}`, tone: 'safe' });
    out.sort((a, b) => a.at.getTime() - b.at.getTime());
    const due = f.nextReportDue;
    if (due && !isTerminalStatus(f.status)) {
      const overdue = due.getTime() < this.now().getTime();
      out.push({ at: due, kind: 'nextDue', label: overdue ? 'Report overdue' : 'Next report due', tone: overdue ? 'overdue' : 'event', future: !overdue, overdue });
    }
    return out;
  });
}
```

> **Step 0 (token):** before implementing, add `--color-status-event: light-dark(hsl(248 12% 48%), hsl(248 15% 61%));` to `tailwind.css` plain `@theme` (generates the `bg-status-event` utility). The `event` tone uses `bg-status-event` — a whole static literal, never an arbitrary `bg-[…]` value.

- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: add accessible incident lifecycle timeline"`

### Task 5.3: Wire map + timeline into detail component

**Files:** Modify `incident-detail.ts`.

- [ ] **Step 1 — Write failing test:** with a fire that has `latitude/longitude`, assert `detailMapPoints()` returns one point with `tone = statusTone(fire.status)`; with null coords returns `[]`.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:** add `IncidentMapComponent` + `IncidentTimelineComponent` to the component `imports`; import `MapPoint` (type) from `../../../shared/ui/tone-classes`, `statusTone` + `operatorName` from `@workspace/shared-domain`, and `isTerminalStatus` from `../../../shared/util/fire-status`. Add `protected readonly detailMapPoints = computed<MapPoint[]>(() => { const f = this.fire(); return f?.latitude != null && f?.longitude != null ? [{ lat: f.latitude, lng: f.longitude, tone: statusTone(f.status), name: f.name }] : []; });`, `protected readonly now = signal(new Date());` with a 60 s `setInterval` cleared via `DestroyRef.onDestroy`, and `protected authorName(id: string): string { return operatorName(id); }`. Keep `resource()`/`can*`/`invoke()` exactly.
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Commit.** `git commit -m "web: compute detail map points + clock"`

### Task 5.4: Detail template — hero, stats, map + timeline, restyle

**Files:** Modify `incident-detail.html`, inline `styles` in `incident-detail.ts`.

- [ ] **Step 1 — Write failing test:** assert (in the `@default` branch with a `going` fire) — a hero region containing `app-status-badge`, the level, and an `app-cadence-countdown`; three stat tiles (area/personnel/aircraft+vehicles) with mono values; an `app-incident-map` inside a `@defer` block (`data-testid="map-placeholder"` in `@placeholder`); an `app-incident-timeline`; and that **all preserved testids still resolve**: `action-edit`, `action-escalate`, `action-sitrep`, `action-create-final`, `action-delete`, and `final-report-placeholder`. axe clean.
- [ ] **Step 2 — Run, expect fail.**
- [ ] **Step 3 — Implement:** inside the existing `@if (fire(); as f)` block, replace `.detail-head` + `.metrics` with: an `<h1 tabindex="-1">{{ f.name }}</h1>`; a severity **hero** (`<header class="detail-hero" [class]="heroToneClass()">` with `app-status-badge`, level label, `<app-cadence-countdown [due]="isTerminalStatus(f.status) ? null : (f.nextReportDue ?? null)" [now]="now()">`, the global id, reported timestamp, and created-by via `authorName(f.createdBy)`); a `.detail-stats` grid of stat tiles; a two-column `.detail-grid` with a **map** `@defer (on viewport; prefetch on idle) { <app-incident-map [points]="detailMapPoints()" [locationDescription]="f.locationDescription" /> } @placeholder { <div class="panel" data-testid="map-placeholder">Map — scroll to load.</div> }` and the **timeline** `<app-incident-timeline [fire]="f" [sitreps]="sitreps()" [finalReport]="finalReport()" [now]="now()" />`. Keep the sitrep accordion, the action bar (verbatim testids/gates), and the final-report `@defer` block (verbatim). Add `heroToneClass()` computed = `'detail-hero--' + statusTone(f.status)` mapped to a token bg (define `.detail-hero--going { background: var(--color-status-going); color: var(--mat-sys-surface); }` etc. in inline styles — base text on fg bg, AA-verified). Restyle `.detail-stats`/`.panel` via tokens only. Keep budget < 8 kB.
- [ ] **Step 4 — Run, expect pass.**
- [ ] **Step 5 — Format + commit.** `bun run format:html` then `git commit -m "web: detail hero + stats + map + timeline"`

### Task 5.5: Final-report panel restyle (visual only)

**Files:** Modify `final-report-panel.ts`.

- [ ] **Step 1 — Confirm contract preserved by test:** existing `final-report-panel.spec.ts` must still pass (inputs `report/fireId/canSign/canRemoveSign/canEditFinal`, outputs, testids `final-report-panel|action-signoff|action-remove-signoff|action-edit-final`). Run it first as the guard.
- [ ] **Step 2 — Restyle** the template's Tailwind classes only: panel uses `rounded-card border border-outline-variant bg-surface-container-low p-4`; the signed-off chip keeps `bg-status-safe-bg text-status-safe`; metric `<dl>` uses `text-on-surface-variant` labels + mono values; buttons use `matButton="outlined"`/`matButton="filled"`. Do NOT touch inputs/outputs/testids/methods.
- [ ] **Step 2b — Author names (display-only):** render `operatorName(report().signedOffBy)` and, when present, `operatorName(report().signOffRemovedBy)` for the sign-off attribution (import `operatorName` from `@workspace/shared-domain`). This is display-only — the input/output/testid contract is unchanged. Update `final-report-panel.spec.ts` to assert the resolved name renders (seed a `report` whose `signedOffBy` is a known operator id).
- [ ] **Step 3 — Run** the existing spec → PASS unchanged.
- [ ] **Step 4 — Commit.** `git commit -m "web: restyle final-report panel to tactical tokens"`

- [ ] **Phase 5 gate:** `bun run check:ci` → pass; Playwright: detail hero/map/timeline render in both themes; live map pans/zooms by keyboard; tile-failure shows SVG fallback; all actions still work.

---

## Phase 6 — Forms, dialogs & dev-switcher restyle

**Outcome:** Forms, the form page chrome, the three dialogs, and the dev-user switcher match the tactical theme. Every widget-switch case, control wiring, data/result contract, and `data-testid` is unchanged — these are visual-only edits guarded by the existing specs.

### Task 6.1: Dynamic-form renderer restyle

**Files:** Modify `apps/web/src/app/shared/forms/dynamic-form.ts` (inline `styles` only).

- [ ] **Step 1 — Guard:** run `bunx nx test web --testNamePattern="dynamic-form|DynamicForm"` → PASS (baseline before edits).
- [ ] **Step 2 — Restyle** the inline `styles` ONLY: `.section` → `rounded-card border border-outline-variant bg-surface-container-low` look via tokens (`border: 1px solid var(--mat-sys-outline-variant)`, `background: var(--mat-sys-surface-container-low)`); `.section__legend` → `font-family: var(--font-display)`; keep `.grid`/`.cell`/`.control-row`/`container-type:inline-size` and the `SPAN_CLASS` `col-*` selectors **verbatim**. Add `mat.form-field-overrides((outlined-container-shape: var(--radius-field), outlined-outline-color: var(--mat-sys-outline-variant)))` to `styles.scss` `@layer material` (not here). Do NOT touch the `@switch`, `[formControl]`, `firstError`, or the `form.events` effect.
- [ ] **Step 3 — Run** the same spec → PASS unchanged; `bun run check:ci`.
- [ ] **Step 4 — Commit.** `git commit -m "web: restyle dynamic-form sections to tactical tokens"`

### Task 6.2: Form-page chrome restyle

**Files:** Modify `apps/web/src/app/shared/forms/form-page.ts` (inline `styles` only).

- [ ] **Step 1 — Guard:** run `bunx nx test web --testNamePattern="form-page|FormPage"` → PASS.
- [ ] **Step 2 — Restyle** `.title` (display font), `.notice`, and the sticky `.actions` bar (token surface + `--app-grid-border`, `box-shadow: var(--mat-sys-level2)`); keep the 4-state `@switch`, `save`/`cancel` outputs, `data-testid="form-cancel|form-save"`, and the `formDirty` `aria-live` region verbatim. Add `scroll-margin-bottom` so the sticky bar never obscures focus (SC 2.4.11).
- [ ] **Step 3 — Run** spec → PASS; `bun run check:ci`.
- [ ] **Step 4 — Commit.** `git commit -m "web: restyle form-page chrome"`

### Task 6.3: Dialogs restyle

**Files:** Modify `apps/web/src/styles.scss` (`mat.dialog-overrides`), and the three dialog templates' Tailwind classes: `features/fire-incidents/dialogs/escalate-dialog.ts`, `shared/dialogs/confirm-dialog.ts`, `shared/dialogs/confirm-reason-dialog.ts`.

- [ ] **Step 1 — Guard:** run the three dialog specs → PASS (baseline).
- [ ] **Step 2 — Add** to `styles.scss` `@layer material`: `@include mat.dialog-overrides((container-color: var(--mat-sys-surface-container-high), container-shape: var(--radius-card)));`
- [ ] **Step 3 — Template tweaks** only (flex/gap/typography utility classes; no logic): keep `mat-dialog-title/content/actions`, the radio group (escalate), the required textarea (confirm-reason), `canConfirm` gating, and all `close()` return shapes (`IncidentLevel|undefined`, `true|undefined`, `{reason}|undefined`) verbatim.
- [ ] **Step 4 — Run** the three specs → PASS unchanged; `bun run format:html` (if any template files are HTML — these are inline TS templates, so skip); `bun run check:ci`.
- [ ] **Step 5 — Commit.** `git commit -m "web: restyle escalate/confirm dialogs"`

### Task 6.4: Dev-user switcher — Material-consistent

**Files:** Modify `apps/web/src/app/shared/components/dev-user-switcher.ts`; Test its spec (create if absent) / `app.spec.ts`.

- [ ] **Step 1 — Write/guard test:** assert selecting a different user calls `DevAuthService.selectUser` with the right id and the control has an accessible label "Dev user" (use `MatSelectHarness` after conversion). Baseline run first.
- [ ] **Step 2 — Convert** the bare `<select>` to a `<mat-select>` (import `MatFormFieldModule`, `MatSelectModule`) with `aria-label="Dev user"`, options from `DEV_USERS` (each showing name + role · district), `(selectionChange)` → `devAuth.selectUser(id)`. Keep `providedIn`/signal wiring; keep it compact (dense form-field) in the toolbar.
- [ ] **Step 3 — Run** test → PASS; `bun run check:ci`.
- [ ] **Step 4 — Commit.** `git commit -m "web: Material-consistent dev-user switcher"`

- [ ] **Phase 6 gate:** `bun run check:ci` → pass; all pre-existing form/dialog specs green.

---

## Phase 7 — Accessibility, responsive & cross-theme verification

**Outcome:** Documented WCAG 2.2 AA conformance and responsive correctness across both themes and three breakpoints; full gate green.

### Task 7.1: Structural axe coverage (jsdom)

**Files:** the per-screen specs (overview, incident-list, incident-detail, incident-map, incident-timeline, kpi-tile, severity-tile, status-mix-bar, cadence-countdown, form-page, dialogs).

- [ ] **Step 1 — Ensure** each screen/component spec includes `expect(await findAxeViolations(fixture.nativeElement)).toEqual([])` (color-contrast/region stay disabled per `axe-helper`). Add any missing.
- [ ] **Step 2 — Run** `bunx nx test web` → all PASS, 0 structural violations.
- [ ] **Step 3 — Commit** any spec additions. `git commit -m "web: structural axe coverage across redesigned screens"`

### Task 7.2: Real-browser verification (Playwright MCP)

**Files:** none (verification; record findings in the PR description).

- [ ] **Step 1 — Serve** web + api. For each of `/overview`, `/incidents`, `/incidents/:id`, `/incidents/new`, `/incidents/:id/sitrep`, `/incidents/:id/final`: run at widths 1320, 820, 390 in **light, dark, and system** themes.
- [ ] **Step 2 — Assert** per view: axe **color-contrast** + **region** = 0 violations (real browser); visible `:focus-visible` ring on all interactives; keyboard-only path works (tab order, dialogs trap+restore focus, map pans/zooms via keyboard, sortable headers operable); `prefers-reduced-motion` disables view-transitions + map animation; tap targets ≥24px; route change moves focus to `#main`; overdue KPI announces (inspect `role="status"`). Capture screenshots of each theme × breakpoint.
- [ ] **Step 3 — Fix** any violation found, re-run, then proceed.

### Task 7.3: Contrast guard, spelling, formatting, full gate

- [ ] **Step 1 — Run** `bun run check:contrast` → all PASS.
- [ ] **Step 2 — Run** `bun run format:html` (Angular templates) and `bun run check` (Biome autofix).
- [ ] **Step 3 — Run** the full gate: `just ci` (check + HTML-format + cspell + markdownlint + test + build) → **green**.
- [ ] **Step 4 — Commit** any formatting/lint fixes. `git commit -m "chore: full CI gate green for tactical redesign"`

### Task 7.4: Sync the spec's palette section

**Files:** Modify `docs/superpowers/specs/2026-05-31-fire-incidents-ui-redesign-design.md`.

- [ ] **Step 1 — Update** the §1 "Theme/Palette" decision and §2 visual-system text from "azure-blue + orange" to **Rosé Pine (Dawn light / Moon dark)** with the A.4 mapping summary, so the spec and plan agree.
- [ ] **Step 2 — Commit.** `git commit -m "docs: sync redesign spec palette to Rosé Pine"`

- [ ] **Phase 7 gate:** `just ci` green; real-browser a11y sweep clean in both themes at all three breakpoints.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Visual system/tokens → Phase 0/§A.4–A.5. New components → §A.7 + Phase 1/5. Dashboard (KPIs, attention, mix, activity, rollup, map) → Phase 3 + §5. List severity-forward + density → Phase 4. Detail map + timeline → Phase 5. Forms/dialogs restyle → Phase 6. Map (Leaflet+CARTO+fallback) → Phase 5/§7. Both themes equally polished → §A.4 + Phase 0 + Phase 7. WCAG 2.2 AA → §A.10 + Phase 7. Preserve contracts/testids → §A.8 + guard steps. Landing on /overview → Phase 2. Rosé Pine + AA → §A.4 + Task 0.6 guard. No gaps.
- **Placeholder scan:** No "TBD/TODO/handle edge cases". Component code is complete; restyle tasks specify exact tokens/selectors; the one open micro-decision (timeline `event` tone) is resolved in-task to the `bg-status-event` token route.
- **Type consistency:** `StatusTone`, `MapPoint`, `SPINE_TONE`/`SEVERITY_TILE_TONE`/`MARKER_TONE_CLASS`, `CadenceState`, `TimelineEvent`, component selectors/inputs match §A.7 across Phases 1/3/4/5. `statusTone()`/`*_LABELS`/`TERMINAL_STATUSES`/`LEVEL_ORDER`/`INITIAL_REPORT_MS`/`operatorName`/`District.regionName` are confirmed barrel exports (INITIAL_REPORT_MS added in 0.2). Per §A.11 the dashboard + list use Remult `count`/`aggregate`/`groupBy` (array form) + bounded `liveQuery`/`find`; `$nin`/`$in`/`$lt` filters and the operator/region exports match Remult 3.3.10 + commit 0aa9e01. Cadence is terminal-status-aware everywhere (§A.11.2).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-31-fire-incidents-ui-redesign.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks, fast iteration (via superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in this session with batch checkpoints (via superpowers:executing-plans).

Recommended branch: `feat/fire-incidents-tactical-redesign` (work off `main` in an isolated worktree).
