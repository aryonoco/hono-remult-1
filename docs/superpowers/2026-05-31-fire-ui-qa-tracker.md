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

## Confirmed issues (seed — real-browser verified)

- [ ] **LIST-1 (blocker): Comfortable/Compact density toggle has NO effect.** Compact renders identically to
      Comfortable — the component's `[data-density=compact] td { padding-block }` is overridden by Material's
      unlayered `mat-cell` padding. Fix with the Material density mechanism (`mat.table-overrides`
      row/header heights, or a scoped density theme), not CSS padding. (`incident-list.{ts,html,css}`)
- [ ] **MAP-1 (major): maps lack symbology and are meaningless.** No legend explaining pin colour→severity/status,
      no incident-name label/popup, plain dots. Add a legend + level-bearing toned markers + name popup/tooltip +
      a sensible default view. (`incident-map.ts`)
- [ ] **DATA-1 (major): LiveQuery "Event Source Error" in the browser console.** Live-update channel (SSE) errors;
      root-cause (api mount / `proxy.conf.json` SSE forwarding / client) and fix so the dashboard "LIVE" indicator
      is honest. (`apps/api/src/main.ts`, `apps/web/proxy.conf.json`, `remult.provider.ts`)
- [ ] **LIST-2 (minor): area bar barely visible / unclear meaning** in the Area column. (`incident-list`)

## Audited issues (from QA audit workflow wf_eee2b159 — appended on completion)

_Pending: the parallel audit (list · dashboard · detail · maps · forms/dialogs · theming/responsive/a11y · livequery)
will enumerate the remaining issues here, each with severity + root cause + fix + files._

## Verified-fixed log

_(append commit shas as issues are fixed + browser-verified)_
