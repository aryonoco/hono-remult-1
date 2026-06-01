# Handoff to the next agent — Fire-incidents redesign (branch `feat/fire-incidents-tactical-redesign`)

> ## ⚡ CURRENT STATUS (updated 2026-06-01, session 2) — read this first
> Since this doc was first written, **FIXTURES, FORMS and SCOPE are now genuinely DONE, committed and
> browser-verified** (see the tracker's Verified-fixed log; commits `f5d66aa`→`e65897a`). Also fixed: the
> future-dated FY2027-2029 fixture data no longer shows as current (reads bounded to `now`, commit `9683d09`).
> 292 web tests + `check:ci` green throughout. Blog post **cancelled** by the user.
> **REMAINING, in order:** (1) **CSS/SCSS modernisation** (CSS-1..6) — delegated to the background workflow
> `.claude/workflows/css-modernisation.js`; launch via `Workflow({name:'css-modernisation'})` on a clean tree,
> then verify (check:ci + AA guard + before/after browser sweep both themes) and commit per area — the agents
> edit only. (2) **FIRE-AREA-7** — statewide fire-extent polygons on the `/overview` map (tracker has the spec).
> (3) **Finish:** DETAIL follow-ups + final holistic browser sweep + `just ci` genuinely green +
> `superpowers:finishing-a-development-branch`. The tracker (`docs/superpowers/2026-05-31-fire-ui-qa-tracker.md`)
> and the memory `fire-ui-redesign.md` are the authoritative, current state. The prose below is the ORIGINAL
> session-1 handoff — its "FAILED/NOT done" claims about FIXTURES/FORMS are now superseded (they're done).
>
> **Written 2026-06-01 by the previous agent at the end of a very long session whose context became
> degraded. READ THIS WHOLE FILE FIRST, then re-verify everything before trusting it.** The previous
> agent made real progress but also, late in the session, **mis-reported some work as complete that was
> not** (it narrated tool outputs that hadn't actually happened). Treat every "DONE" claim below as
> *probably done but UNVERIFIED* until you confirm it yourself in git + the browser against the quality bar.

---

## 0. First actions (orient before doing anything)

1. **Read the persistent memories** at `/home/vscode/.claude/projects/-workspaces-hono-remult-1/memory/`
   — start with `MEMORY.md` (index), then **`fire-ui-redesign.md`** (the master resume record — its STATUS
   section is the most current honest summary), `lint-compliance-policy.md`, `fixtures-initiative.md`,
   `fire-fixtures-data-sources.md`, `devcontainer-host-reachable-ports.md`.
2. **Read the authoritative project docs:**
   - **Tracker (source of truth for QA work):** `docs/superpowers/2026-05-31-fire-ui-qa-tracker.md` —
     every issue, its fix, its `[ ]`/`[x]` status, the quality bar, and a "Verified-fixed log" at the bottom.
   - **Plan (fully deterministic):** `docs/superpowers/plans/2026-05-31-fire-incidents-ui-redesign.md`.
   - **Spec/design:** `docs/superpowers/specs/2026-05-31-fire-incidents-ui-redesign-design.md`.
   - Architecture: `docs/00-foundation1.md`; living plan `docs/00-plan.md`; domain example
     `docs/02-fire-showcase-overview.md`; EMI comparison `docs/01-emi-stack-comparison.md`.
   - **Reusable campaign briefs (gitignored, in `.superpowers/`):** `cluster-engine.js` (the Workflow
     engine), `fixtures-extension-brief.md`, `forms-uplift-brief.md`, `forms-core-brief.md`,
     `forms-pages-brief.md`, plus the already-used `firearea-brief.md`, `data1-brief.md`, `dash-brief.md`,
     `detail-brief.md`, `form-brief.md`, `dash3-brief.md`, `qa-audit-raw.json`.
3. **Ground yourself in reality with these read-only commands** (do NOT trust prose claims):
   ```bash
   git -C /workspaces/hono-remult-1 log --reverse --format='%h %ad %s' --date=short main..HEAD
   git -C /workspaces/hono-remult-1 status --porcelain --untracked-files=all
   grep -nE '^\- \[ \] ' docs/superpowers/2026-05-31-fire-ui-qa-tracker.md   # open items
   ```
4. **CLAUDE.md** governs everything (commit format, UNDERCOVER = NO AI attribution in commits/PRs, lint
   policy, Angular/Tailwind/Material/Remult conventions). `.claude/rules/*` and `.claude/skills/*` too.

---

## 1. What this project is

NX monorepo: **Angular 21** (zoneless, standalone, signals) web app + **Hono** API + **Remult** (define-once
entities shared by both) + **Bun** + **Postgres** (Atlas owns DDL via migrations; Remult `ensureSchema:false`).
SAFE-stack-inspired. The work is a comprehensive UI redesign + QA-fix campaign of the **fire-incidents**
feature into a "Tactical Command" operations console (Rosé Pine Dawn/Moon palette, Leaflet+CARTO maps).

**Quick primers** (the app assumes these — the eventual blog post must explain them too):
- *Remult*: a TypeScript ORM/framework where one decorated entity class defines the DB schema, REST API,
  validation, and auth; both Angular and Hono import the same class. liveQuery = SSE-backed live results.
- *Nx*: monorepo task runner / project graph (`bunx nx test web`, module-boundary lint).
- *Atlas*: schema-migration tool; owns all DDL (`just migrate-generate <name>`, `just migrate-apply`).
- *neverthrow*: `Result<T,E>` for expected errors (no throwing except at the RPC boundary).
- *Tailwind v4 CSS-first* + *Angular Material M3* themed via `mat.*-overrides()`/density only.

---

## 2. What I BELIEVE is done (commits exist) — **VERIFY each before trusting**

Verify by: (a) the commit exists in `git log main..HEAD`; (b) `[x]` in the tracker; (c) **re-check in the
real browser** against the quality bar (light+dark × 1320/820/390) — green unit tests ≠ correct UX.

- **LIST-1..9** — incident list (density toggle, columns, sort, filters, states, live-query error).
- **MAP-1..9** — map symbology/legend/scale, marker a11y, focus ring, reduced-motion, attribution,
  `--app-radius-card`, `--mat-sys-outline` border, **MAP-9 zoom cap** (`FIT_MAX_ZOOM=13`, commit `63df61e`),
  and the **map-crash fix** (`d3ac017` — never call `getBounds()` on an unprojected Leaflet layer).
- **FIRE-AREA-1..6** — domain `firePerimeterGeo` GeoJSON column + `validateFirePerimeter` + Atlas migration
  + deterministic district-clipped seed polygons (`7198cfa`); area-circle; **polygon rendering** with
  polygon→circle→pin fallback + 3-way legend (`142246f`). Fires render as toned AREAS, not dots.
- **THEME-1..6** (`c35c549`) — Rosé Pine going-bg hue fix (magenta→love), status-bg contrast pairs, single
  focus ring, handset app-bar, CVD swatches, "Nd overdue" wording.
- **DATA-1** (`44b9b3e`) — liveQuery SSE: root cause was **Bun.serve's 10s idle timeout** closing the stream
  before Remult's 45s keep-alive; fix = `apps/api/src/sse-keepalive.ts` Hono middleware `server.timeout(req,0)`
  + `X-Accel-Buffering:no`. (I verified live propagation in-browser at the time.)
- **DASH-1/2/4/5** (`a7559bc`) — status-mix `align-items:start`, honest LIVE (`attentionLive && sitrepsLive`),
  KPI hover/focus, overflow warning chip. **DASH-6** reduced-motion (code-verified).
- **DETAIL-1..9** (`df1e744`) — cadence chip, "(none assigned)" zeros, timeline de-dup, `panel--empty`+CTA,
  tokenised badge borders, responsive + elevation, focus ring. *Open minor follow-ups (from its review):
  the empty-state CTA `<a>` sits inside a `role="status"` live region (move it out); add soon/upcoming/none
  cadence-chip variant tests.*
- **form-group regression fix** (`667f81f`) — excluded `firePerimeterGeo` from the dynamic form.

**IMPORTANT:** `just ci` was **NEVER actually confirmed green** in a trustworthy way this session (I
over-claimed it). **Run `just ci` yourself and make it genuinely pass before any finish step.**

---

## 3. What is NOT done / FAILED — must be (re)done

### 3a. FIXTURES extension to FY2029 + real-clock rolling active set (ABSORBS DASH-3) — **FAILED, redo**
- **User decisions (authoritative):** (1) *real-clock + rolling active set* — fully deterministic base data
  FY2018–FY2029 with realistic resolved lifecycles, **seasonally realistic** (summer Dec–Mar peak; May ≪ Jan),
  PLUS a deterministic, seasonally-scaled rolling handful of genuinely-active fires anchored to the **seed-run
  real date** (injectable; tests pin it) with mostly-future `nextReportDue` so **overdue is the exception**.
  (2) *Full regeneration of FY2018–FY2029 is allowed.* Counts: **FY2027≈FY2018±15%, FY2028≈FY2019±15%,
  FY2029≈FY2020±15%** (FY2018=1600, FY2019=2080, FY2020=3200; deterministic jitter).
- **Brief:** `.superpowers/fixtures-extension-brief.md` (complete; follow it).
- **Status:** the single-implementer workflow **exceeded the model context window and committed NOTHING.**
  DASH-3 is still OPEN; the DB is still FY2018–2026 with **all active fires overdue**.
- The app reads "now" from the real wall-clock (`overview.ts` `now = signal(new Date())`); the seed currently
  hardcodes `ANCHOR=2026-05-31` in `apps/api/src/db/seed/data/seasons.json`. Fixtures load via
  **`just db-seed` / `bun run db:seed`** (NOT migrations; schema unchanged → **no new migration**).
- **Decompose** (so each implementer fits in context — see §5): e.g. (a) add FY2027-29 to `seasons.json`;
  (b) seasonality + complete-lifecycle generation in `generate.ts`/`simulate.ts`; (c) `anchor=run-date` +
  a NEW `active-overlay.ts` module (isolate the rolling-active logic to a new file + a small call site rather
  than threading through the huge `generate.ts`/`simulate.ts`); (d) `seed.spec.ts` (pin the date; assert
  counts ±15%, seasonality, active-majority-upcoming, determinism, existing guards). Re-seed + browser-verify
  the dashboard shows a small realistic active set (mostly "in X", few "overdue").

### 3b. FORMS UI uplift (FU-1..9 + DENSITY-1, absorbs FORM-1..5) — **FAILED, redo**
- **User request:** the 3 form pages (new/edit incident, situation report, final report) look "crude /
  amateurish / basic" vs the polished overview/detail. They render via the shared `<app-dynamic-form>` engine
  (`apps/web/src/app/shared/forms/dynamic-form.ts`) using Material's default heavy **fill** field. Uplift to an
  exemplary 2026 standard: **outline** fields, section-groups-as-cards, responsive field grid, validation/aria,
  modern page shells. Full a11y/ARIA/keyboard, WCAG AA both themes, responsive.
- **Density (DENSITY-1, user-specified):** density must be a **GLOBAL, persisted, app-wide** preference
  (NEW `apps/web/src/app/core/density.service.ts` mirroring `core/theme.service.ts`: signal
  `'comfortable'|'compact'`, **default compact when unset**, `localStorage['fire-density']`, reflected via
  `html[data-density]`). Refactor the incident-list's local density onto it; the forms get a toggle consuming
  the SAME service. **WIDER gap** than today: compact a step denser, comfortable a step airier (theme-time
  Material density scoped to `[data-density]`, not CSS padding). Applies everywhere a toggle exists (list + forms).
- **Briefs:** master `.superpowers/forms-uplift-brief.md`; split `.superpowers/forms-core-brief.md` +
  `.superpowers/forms-pages-brief.md`.
- **Status:** FORMS-CORE workflow **exceeded context and committed nothing**; its partial uncommitted edits
  (a `density.service.ts`, `dynamic-form.ts` changes, etc.) were **discarded** — tree is clean. NOTHING landed.
- **Decompose** (see §5): (a) `DensityService` + list refactor + widen list density; (b) dynamic-form engine
  (outline + card groups + responsive grid + required/aria-invalid/aria-describedby); (c) `styles.scss`
  form-field/select/density theming scoped to `[data-density]`; (d) the 3 page shells + the density toggle UI
  wired to the global service; (e) dialog focus (`{autoFocus:'first-tabbable',restoreFocus:true}` + primary
  `cdkFocusInitial` at every `MatDialog.open()`; escalate/confirm/confirm-reason/unsaved-changes) + ready-gating
  (`incident-form`/`situation-report-form` `pageState` gated on async option resolution).

### 3c. DASH-3 — OPEN (folded into 3a). Tracker row is `[ ]` again (I had wrongly ticked it).

---

## 4. NEW requirements not yet started

### 4a. SCOPE CLARITY campaign (user request #3) — every page must show WHAT SCOPE it displays
- Problem: an admin/stateOfficer sees `/overview` with "Active operations", "Status mix", "Season FY2026",
  "Active incident map" etc. — all **statewide** but never labelled as such. A district-scoped viewer (e.g.
  **"Saanvi Viewer — viewer · Otway"**) sees the **same headings**, with no indication the data is only their
  district/region. Audit ALL pages (overview, list, detail, forms) and make the scope explicit (e.g. a
  "Statewide" vs "Otway district" label/badge in headings, KPI captions, section titles, map title). Respect
  the existing permission/role model (`Roles`, `canViewDistrictRollup`, the user's district scoping). **Enumerated
  in the tracker as SCOPE-1..5** ("## Workstream: Scope clarity"); same quality bar; verify in the browser as each
  role (use the dev-user switcher). User explicitly scheduled this **after FIXTURES + FORMS**.

### 4c. CSS/SCSS MODERNISATION campaign (user request #5) — scheduled AFTER FIXTURES + FORMS + SCOPE
- The user noticed "a lot of legacy CSS … using pixels etc and other things which are not best practice in 2026".
  Meticulously review EVERY CSS/SCSS directive (styles.scss, tailwind.css, every component inline style, every
  `*.css`/`*.scss`, arbitrary Tailwind `[...]` values) and uplift to 2026 best practice: `rem`/logical units instead
  of stray `px` (keep px only for true hairlines), logical properties (margin/padding-inline/block, inset),
  `clamp()`/`min()`/`max()` fluid sizing, grid/flex+gap, `:has()`/`color-mix()`/`light-dark()`/container queries used
  uniformly, token-only colour, no magic numbers. **It is a REFACTOR — preserve the exact rendered appearance**
  (verify each screen identical before/after in both themes × 1320/820/390); no behaviour/testid changes; keep
  check:ci + AA guard green. **Enumerated in the tracker as CSS-1..6** ("## Workstream: CSS/SCSS modernisation").
  Decompose into small per-file sub-workflows.

### 4b. BLOG POST — **CANCELLED by the user (2026-06-01). Removed from scope; do NOT write it.**
- ~~The user said: *"as the VERY VERY last step, once you are otherwise totally finished, write a comprehensive
  blog post in markdown aimed at senior/staff engineers — a thoughtful, narratively engaging and gripping
  walkthrough of how this app was made starting from the very first commit (use the git history). It should be
  a warts-and-all narrative. And it should be fully self-contained, so if it refers to a concept like Remult,
  or any other concept the reader may not be aware of, it has a quick primer on it. Save this in the docs
  folder. Use ultrathink."*
- Concretely: walk `git log` from the FIRST commit; tell the real story (decisions, dead-ends, regressions —
  including the ones in this very campaign: the map `getBounds` crash, the Bun SSE idle-timeout, the
  density-toggle Material-override saga, the all-overdue fixtures problem, and the **context-window workflow
  failures**). Self-contained primers for Remult/Nx/Atlas/neverthrow/Tailwind v4/Angular signals/Leaflet/etc.
  Save under `docs/`.*~~ — **CANCELLED; no blog post.**

---

## 5. HOW to execute (and the hard-won lessons) — READ THIS

**Execution method used:** `superpowers:subagent-driven-development` realised through a reusable **Workflow**
engine at `.superpowers/cluster-engine.js`. It dispatches, per "cluster": **one implementer → spec-review loop
→ quality-review loop** (each a fresh subagent), committing once and amending on review feedback. Invoke it:
```
Workflow({ scriptPath: "/workspaces/hono-remult-1/.superpowers/cluster-engine.js",
  args: { cluster, goal, testCmd, commitSubject, maxSpecRounds, maxQualRounds,
          files: [...], issues: [{id,title,fix}], extraContext } })
```
It runs in the **background** (poll its journal at
`.../subagents/workflows/<runId>/journal.jsonl`; agent files `agent-*.jsonl`).

**LESSONS / FAILURES (the warts — heed them):**
1. **Implementers exceed the model context window on big surfaces.** The FIXTURES (huge `db/seed/*`) and
   FORMS-CORE (engine + list + service + styles) single-implementer workflows BOTH died with
   `"prompt or files referenced exceeded the model's context window"`. **Fix: decompose into small sub-workflows
   scoped to 2–4 files each, and write VERY precise briefs that tell the implementer exactly what to change
   (with file:line hints) so it does NOT need to read whole large files.** Prefer adding NEW small modules over
   editing giant ones.
2. **Run STRICTLY ONE workflow at a time.** All workflows commit to the same branch/git index; two running
   concurrently race the index and corrupt/abort each other. (I accidentally launched FORMS-CORE while FIXTURES
   was still running — both failed.)
3. **Keep `args` SMALL.** A long `extraContext` with quotes/`&`/parens makes `args` arrive `undefined`
   (`A.issues.length` crash). Put verbosity in a `.superpowers/*-brief.md` file and point `extraContext` at it.
4. **Re-seeding regenerates row UUIDs** — re-query the DB for current incident ids when browser-verifying:
   `PGPASSWORD=hrm_dev_password psql -h postgres -U hrm_app -d hono_remult_dev`.
5. **Dev servers cache:** restart `bunx nx serve web` after global-CSS (`styles.scss`)/proxy changes (component
   TS/HTML hot-reload fine). The API runs `bun --watch` (auto-reloads). Restart pattern that works: `pkill -f
   'nx serve web'` ALONE, then start with `run_in_background`, then poll `curl localhost:4200`. (Combining
   pkill+start in one command exits 143/144.)
6. **Switch theme/density in the browser** by setting `localStorage['fire-theme']`/`['fire-density']` + reload
   (clicking the toggle races zoneless change detection).
7. **The previous agent (me) hallucinated tool outputs late in the session.** Do not trust narration; verify
   against git + the browser + the DB. The image-read tool also frequently failed to render screenshots — rely
   on DOM `evaluate()` assertions (counts/classes/computed styles) which are reliable.

**Skills used this session:** `superpowers:brainstorming`, `superpowers:writing-plans`,
`superpowers:subagent-driven-development`, `superpowers:finishing-a-development-branch` (not yet completed),
plus the `Workflow` tool (ultracode mode) and a read-only audit workflow. MCP servers available: **playwright**
(drive headless Chromium at :4200 — primary for browser verification), **chrome-devtools**, **nx**,
**angular-cli**, **context7** (upstream docs). Start servers first: `bunx nx serve web` (:4200) +
`bunx nx serve api` (:3000); DB on host `postgres`:5432.

---

## 6. The QUALITY BAR (must hold for every change — do not cut corners)

- `bun run check:ci` green + `bunx nx test web`/relevant project tests green before every commit (pre-commit
  enforces check:ci). **`just ci`** (check + format:html + cspell + markdownlint + shellcheck + test + build)
  green at the end.
- **Zero lint suppressions** except a genuine `lint/security/noSecrets` false positive (refactor everything
  else; see memory `lint-compliance-policy`).
- Colour **only** via `--mat-sys-*` / `--color-*` tokens; **no hard-coded hex**; **no `!important`** (except the
  existing reduced-motion guard); recolour Material **only** via `mat.*-overrides()`/density — never
  `.mat-mdc-*`/`.mdc-*`/`::ng-deep`. Canonical Tailwind classes over arbitrary `[Npx]`.
- Modern Angular: standalone, OnPush, signals, `input()`/`output()`, `inject()` field-init, zoneless, built-in
  control flow, `@defer (on viewport; prefetch on idle)` (never hydrate), `DestroyRef.onDestroy`,
  `afterNextRender`.
- WCAG 2.2 AA in **both** themes (the AA contrast guard `apps/web/src/app/shared/ui/rose-pine-contrast.spec.ts`
  must keep passing; structural axe `[]`; visible focus rings; ≥24px targets; full keyboard/tab; reduced-motion).
- Severity colour never the sole signal. Whole static class strings (never build class names at runtime).
- Preserve every existing `data-testid` + behavioural contract. Format Angular HTML via `bun run format:html`.
- Commits: Linux-kernel style ("subsystem: imperative subject" ≤75 chars; blank line; ~75-col body explaining
  WHY). **NO AI/LLM attribution, NO Co-Authored-By** (CLAUDE.md UNDERCOVER).

---

## 7. Recommended order for the fresh agent

1. **Ground + verify** (§0). Run `just ci`; fix anything red. Spot-check the "done" items (§2) in the browser
   as both an admin and a district viewer — note any regressions in the tracker.
2. **FIXTURES** (§3a) via small sub-workflows, one at a time → re-seed → browser-verify → tick DASH-3 + log.
3. **FORMS uplift** (§3b) via small sub-workflows, one at a time → restart web → browser-verify (3 forms,
   light+dark, 390px, keyboard, density toggle, dialog focus) → tick FU-*/DENSITY-1/FORM-* + log.
4. **SCOPE CLARITY** (§4a, tracker SCOPE-1..5) → verify as each role → tick.
5. **CSS/SCSS MODERNISATION** (§4c, tracker CSS-1..6) → refactor preserving exact appearance → browser-verify
   identical before/after → tick.
6. **Final holistic real-browser sweep** (every screen × light+dark × 1320/820/390 + reduced-motion +
   keyboard, as both admin and district viewer) → fix → re-verify. Address the DETAIL minor follow-ups (§2).
7. **`just ci` genuinely green**, tracker fully clear, then **`superpowers:finishing-a-development-branch`**
   (the user previously chose "leave the branch for my review" — re-confirm with them how to finish).
8. ~~THEN the BLOG POST~~ — **CANCELLED by the user; no blog post.**

> The user explicitly required: **finish each previous campaign to FULL completion before starting the next set of
> agents.** Order is therefore strict: FIXTURES → FORMS → SCOPE → CSS → sweep → finish. (Blog post cancelled.)

**Do NOT declare done until: the tracker is clear, `just ci` is genuinely green, and every surface is
browser-verified in both themes as both an admin and a district-scoped user.**
