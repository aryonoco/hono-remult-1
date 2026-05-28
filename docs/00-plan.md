# Implementation Plan

A living view of the hono-remult-1 platform — what is in place today, what is queued next, what is deliberately excluded. See `00-foundation1.md` for the architecture rationale, `01-emi-stack-comparison.md` for the comparison against the existing EMI stack, and `02-fire-showcase-overview.md` for the specification of the first real domain.

---

## In Place

### Monorepo, tooling, module boundaries

NX workspace on the Bun runtime. TypeScript in ultra-strict mode. Biome handles lint and format for TS, CSS, and JSON with every rule category set to error; Prettier handles HTML templates only; ESLint is scoped to `neverthrow/must-use-result` and `@nx/enforce-module-boundaries`. Runtime versions pinned via `mise`. `bun run check:ci` is the single CI gate.

Three NX scopes — `scope:shared`, `scope:web`, `scope:api` — with dependency rules and `bannedExternalImports` that stop Angular code reaching the API, Hono code reaching the browser, and platform-specific code reaching the shared domain in either direction.

### Hono API shell

A thin Hono application on `Bun.serve`. Mounts Remult with a role-gated admin panel and resolves the current user from the request. Carries no business logic. Non-Remult routes will only ever be added for things Remult cannot handle (OAuth callbacks, webhooks, file uploads).

### Angular application

Zoneless Angular 21 — standalone components, signals, `inject()`, built-in control flow, Tailwind v4. Remult is wired through an app initializer that hands Angular's `HttpClient` to the Remult client; a dev-server proxy forwards `/api` to the API. `core/` holds singletons (Remult provider, dev-auth service, dev-auth interceptor); `shared/components/` holds reusable UI. The root `App` component temporarily hosts the Task CRUD inline — it shrinks to a routed shell once feature routes exist.

### Shared domain library

`libs/shared/domain/` is the source of truth for entities. Currently holds one example entity (`Task`) that exercises the full decorator surface end-to-end: granular CRUD permissions, owner-or-admin row-level update, admin-only delete, `apiPrefilter` for row visibility, a `saving` lifecycle hook for audit population, and field-level read-only protection. Real domain content lands with the fire showcase.

### Error handling convention

All expected failures flow through `neverthrow` `Result` / `ResultAsync`. The `must-use-result` ESLint rule guarantees no Result is silently discarded. Throwing is reserved for genuine bugs and unrecoverable failures.

### Dev authentication

Header-based scaffold that provides real permission enforcement without standing up an IDAM integration. Three preset users (Admin, User, Viewer) plus anonymous, swappable via a floating switcher and persisted to localStorage. The browser sends `X-Dev-User`; the API maps it to a user record; `remult.subscribeAuth` reloads scoped data on switch.

This entire layer is transitional. When real authentication lands, the roles constants, dev users array, dev-auth service, interceptor, switcher component, and the `getUser` body all go. Entity permissions stay untouched.

### Persistence and schema management

Postgres 18.4 runs as a sidecar in the devcontainer (`hono_remult_dev` database, `app` schema, `pgcrypto`/`citext`/`pg_stat_statements` extensions, tuned config). The API uses `remult/postgres` with `ensureSchema: false` — Remult never runs DDL in production code paths.

**DDL is owned by Atlas (community edition, pinned via `mise`)**, schema-as-code style. Migrations live in `apps/api/src/migrations/*.sql`, committed to the repo and reviewed as part of normal PRs. `apps/api/src/db/sync-to-desired.ts` populates a scratch DB (`atlas_desired`) with the current Remult entity schema; `atlas migrate diff` generates SQL diffs from it; `atlas migrate apply` applies them. `atlas migrate lint` flags destructive changes before merge.

**Two-role least-privilege** at the Postgres level is now active: the API connects as `hrm_runtime` (DML only); Atlas connects as `hrm_app` (full DDL). A compromised API process cannot mutate the schema.

The setup is intentionally portable: when GitHub Actions, Terraform, and Azure Postgres Flexible Server land, only an `env "azure"` block in `atlas.hcl` and a workflow file get added — local files and developer commands stay identical.

---

## To Build

### Fire incident showcase

The first real domain, fully specified in `02-fire-showcase-overview.md`: four entities (`FireIncident`, `SituationReport`, `FinalReport`, `District`), eleven enums, four roles with a 15-row permission matrix, district-scoped row filtering, and business rules covering fire numbering, next-report-due cadence, status transitions, and sign-off lifecycle. Four backend operations: `getNextFireNumber`, `escalate`, `softDelete`, `removeSignOff`. Frontend: incident list, detail with sitrep timeline, incident form, sitrep form. Closes with the "add one field, two files, no codegen" demo — the headline argument for the stack.

The four-role permission story requires extending the dev users array to eight identities (three districts × {incidentEditor, viewer} plus global admin and stateOfficer) so row filtering can be exercised.

### Angular feature structure

`features/` folder with lazy-loaded routes. Introduced alongside the fire showcase rather than as standalone work — `features/fire-incidents/` is the first to land. The root `App` component becomes a routed shell at the same time.

### Backend operations, relations, cross-entity logic

`@BackendMethod`s (instance and static), entity relations (`Relations.toOne`, `Relations.toMany`), and `*.operations.ts` files for cross-entity work. Same patterns then repeat for every subsequent domain.

### Real authentication (Entra ID)

Replace `getUser` in the Hono mount with JWT/OIDC verification. Add MSAL or equivalent to the Angular app. Replace `DevAuthService`, the interceptor, the switcher component, and `DEV_USERS` with real auth and a login/logout flow. Entity-level permissions stay as-is — the swap is contained to the middleware and the Angular auth shell.

---

## Deliberately Out of Scope

Async job processing (today handled by Azure Functions in EMI), scheduled work, PDF generation, mapping integrations, external messaging. These belong to the broader migration conversation, not the platform proof. Revisit once the fire showcase has landed and the team has agreed on direction.
