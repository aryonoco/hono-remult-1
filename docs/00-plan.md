# Implementation Plan

A living view of the hono-remult-1 platform — what is in place today, what is queued next, what is deliberately
excluded. See `00-foundation1.md` for the architecture rationale, `01-emi-stack-comparison.md` for the comparison
against the existing EMI stack, and `02-fire-showcase-overview.md` for the specification of the first real domain.

---

## In Place

### Monorepo, tooling, module boundaries

NX workspace on the Bun runtime. TypeScript in ultra-strict mode. Biome handles lint and format for TS, CSS, and JSON
with every rule category set to error; Prettier handles HTML templates only; ESLint is scoped to
`neverthrow/must-use-result` and `@nx/enforce-module-boundaries`. Runtime versions pinned via `mise`. `bun run check:ci`
is the single CI gate. Unit tests run on Vitest via `bun run test` (`nx run-many -t test`): the shared-domain suite
(cadence helpers, the fire BackendMethods, and enum-label/badge exhaustiveness) and the web suite (the app shell,
theming, the metadata-driven forms engine and shared UI components, the UI permission predicates, and the
notification/error helpers).

Three NX scopes — `scope:shared`, `scope:web`, `scope:api` — with dependency rules and `bannedExternalImports` that stop
Angular code reaching the API, Hono code reaching the browser, and platform-specific code reaching the shared domain in
either direction.

### Hono API shell

A thin Hono application on `Bun.serve`. Mounts Remult with a role-gated admin panel and resolves the current user from
the request. Carries no business logic. Non-Remult routes will only ever be added for things Remult cannot handle (OAuth
callbacks, webhooks, file uploads).

### Angular application

Zoneless Angular 21 — standalone components, signals, `inject()`, built-in control flow, Angular Material (M3, azure
palette), and Tailwind v4 for layout. Remult is wired through an app initializer that hands Angular's `HttpClient` to
the Remult client; a dev-server proxy forwards `/api` to the API. The root `App` is a routed Material shell: a toolbar
(app title, theme toggle, dev-user switcher) over a sidenav that switches between `side` and `over` modes on a CDK
handset breakpoint, with a lazy-loaded `incidents` route. `core/` holds singletons (Remult provider, dev-auth service
and interceptor, a `ThemeService` that persists a light/dark/system preference to `localStorage` and drives a
`data-theme` attribute, and a `NotificationService` over `MatSnackBar`); `shared/` holds the reusable frontend
foundations — a metadata-driven forms engine with an `<app-dynamic-form>` renderer (`shared/forms/`), the
`<app-datetime-field>` and status-badge components alongside the theme toggle and dev-user switcher
(`shared/components/`), UI permission predicates that mirror the entity rules (`shared/auth/`), and a `toErrorMessage`
helper (`shared/util/`); `features/` carries lazy feature routes — `fire-incidents` holds the three form configs and a
placeholder list, with its screens (list, detail, dialogs, and the form components) still to be built.

### Shared domain library

`libs/shared/domain/` is the source of truth for entities. It holds the four fire-showcase entities — `District`,
`FireIncident`, `SituationReport`, `FinalReport` — each with its full field schema, role-based and row-level
permissions, district-scoped `apiPrefilter`, `saving` / `saved` lifecycle hooks, and relations; the eleven fire-domain
enums; the `helpers.ts` computation module (financial-year, global-incident-id, and report-cadence math, plus the
shared `withServerInternal` lock helper and the shared `TIMESTAMP_PAIRS` list); the four fire BackendMethods
(`getNextFireNumber`, `escalate`, `softDelete`, `removeSignOff`); and the frontend-facing label and badge maps
(`enum-display.ts` human-readable enum labels, `ui.ts` status-badge classes). A Vitest suite covers the cadence
helpers, every BackendMethod, and the enum-label/badge exhaustiveness. `02-fire-showcase-overview.md` is the full
specification.

### Error handling convention

All expected failures flow through `neverthrow` `Result` / `ResultAsync`. The `must-use-result` ESLint rule guarantees
no Result is silently discarded. Throwing is reserved for genuine bugs and unrecoverable failures — and for the single
RPC boundary inside each BackendMethod, where a modelled `Result` is converted to a thrown error because that is the
form Remult's transport carries across the wire.

### Dev authentication

Header-based scaffold that provides real permission enforcement without standing up an IDAM integration. Eight preset
users — global admin, global stateOfficer, and an incidentEditor + viewer pair for each of three staffed districts
(Otway, Latrobe, Mallee) — plus anonymous, swappable via a switcher in the app toolbar and persisted to localStorage.
The `CurrentUser` type extends Remult's `UserInfo` with `districtId: number | null`; the switcher renders each user's
role and district on every option, with the active user's roles and district shown alongside on wider viewports. The
browser sends `X-Dev-User`; the API maps it to a `CurrentUser` record; `remult.subscribeAuth` reloads scoped data on
switch.

This entire layer is transitional. When real authentication lands, the roles constants, dev users array, `CurrentUser`
type, dev-auth service, interceptor, switcher component, and the `getUser` body all go. Entity permissions stay
untouched.

### Persistence and schema management

Postgres 18.4 runs as a sidecar in the devcontainer (`hono_remult_dev` database, `app` schema,
`pgcrypto`/`citext`/`pg_stat_statements` extensions, tuned config). The API uses `remult/postgres` with `ensureSchema:
false` — Remult never runs DDL in production code paths.

**DDL is owned by Atlas (community edition, pinned via `mise`)**, schema-as-code style. Migrations live in
`apps/api/src/migrations/*.sql`, committed to the repo and reviewed as part of normal PRs.
`apps/api/src/db/sync-to-desired.ts` populates a scratch DB (`atlas_desired`) with the current Remult entity schema;
`atlas migrate diff` generates SQL diffs from it; `atlas migrate apply` applies them. `atlas migrate lint` flags
destructive changes before merge.

**Two-role least-privilege** at the Postgres level: the API connects as `hrm_runtime` (DML only); Atlas connects as
`hrm_app` (full DDL). A compromised API process cannot mutate the schema.

The setup is intentionally portable: when GitHub Actions, Terraform, and Azure Postgres Flexible Server land, only an
`env "azure"` block in `atlas.hcl` and a workflow file get added — local files and developer commands stay identical.

Remult by design does not express DB-level constraints (UNIQUE, INDEX, CHECK) in entity decorators. The project's
convention is per-entity `SchemaExtras` arrays: each entity that needs additional DDL exports a `readonly string[]` of
raw SQL fragments alongside the class; `apps/api/src/db/sync-to-desired.ts` collates and applies them to the scratch DB
after `ensureSchema`, so Atlas sees the constraints in the desired state and auto-generates them in the next migration
diff. Every fire-showcase entity that needs DB-level constraints uses this convention.

---

## To Build

### Fire incident showcase — frontend and demo

The fire domain layer, the shared label/badge maps, the routed Material shell, and the shared frontend foundations
(the metadata-driven forms engine, `<app-datetime-field>`, `StatusBadgeComponent`, and the permission-gating and
notification helpers) are in place — see *In Place* above and `02-fire-showcase-overview.md` for the full
specification. What remains is the user-facing feature and the closing demo: the screens under
`features/fire-incidents/` (incident list, incident detail with situation-report timeline and final-report panel, and
the incident / situation-report / final-report form components) — `features/fire-incidents/` today holds the three form
configs and a placeholder list, but none of the screens that render them. The closing "add one field, two files, no
codegen" demo is the headline argument for the stack. See
`02-fire-showcase-overview.md` *Implementation Phases (Phase
4–5)* and *Frontend Architecture §4–§14* for per-phase scope.

### Cross-entity operations

Static `@BackendMethod`s and entity relations (`Relations.toOne` / `Relations.toMany`) are in place in the fire domain.
Logic that belongs to no single entity will live in `*.operations.ts` files; none is needed yet. The same entity-first
patterns repeat for every subsequent domain.

### Real authentication (Entra ID)

Replace `getUser` in the Hono mount with JWT/OIDC verification. Add MSAL or equivalent to the Angular app. Replace
`DevAuthService`, the interceptor, the switcher component, and `DEV_USERS` with real auth and a login/logout flow.
Entity-level permissions stay as-is — the swap is contained to the middleware and the Angular auth shell.

---

## Deliberately Out of Scope

Async job processing (today handled by Azure Functions in EMI), scheduled work, PDF generation, mapping integrations,
external messaging. These belong to the broader migration conversation, not the platform proof. Revisit once the fire
showcase has landed and the team has agreed on direction.
