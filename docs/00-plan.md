# Implementation Plan

## Current State

A standalone Angular 21 app in `test-app-1/` with biome, Tailwind, and strict TypeScript. No monorepo, no backend, no Remult.

---

## Stage 1: Convert to NX Monorepo ✅

- Initialized NX workspace
- Moved Angular app into `apps/web/`
- Configured `tsconfig.base.json` with `@workspace/shared-domain` path alias

## Stage 2: Create the Shared Domain Library ✅

- Created `libs/shared/domain/` with `project.json`, `tsconfig`, and barrel `index.ts`
- Tagged `scope:shared` in NX

## Stage 3: Add Hono API Application ✅

- Installed `hono`, created `apps/api/` with Hono + Bun server
- Tagged `scope:api`

## Stage 4: Add Remult and Create First Entity ✅

- Installed `remult`, defined `Task` entity in shared domain
- Mounted Remult on Hono, connected Angular via `HttpClient` adapter
- Angular CRUD working through auto-generated endpoints

## Stage 5: Set Up Module Boundary Enforcement ✅

- Installed `@nx/eslint-plugin`
- Configured `@nx/enforce-module-boundaries` in ESLint flat config
- `depConstraints`: shared → shared only, web → shared+web, api → shared+api
- `bannedExternalImports` on shared: `@angular/*`, `hono`, `hono/*`
- Validated with `bun run check:ci` and negative boundary test

## Stage 6: Dev Auth with Switchable Users ✅

Chose header-based dev auth over a full IDAM integration — lets us build features with real permissions now, swap to Entra ID later by changing only the middleware.

- Defined `Roles` constants in `libs/shared/domain/src/auth/roles.ts` (temporary — delete/modify when real IDAM comes))
- Defined 3 dev users in `libs/shared/domain/src/auth/dev-users.ts` (temporary — delete when real IDAM comes)
  - Admin (admin + user roles), User (user role), Viewer (authenticated, no roles), plus anonymous (no header)
- Added `getUser` to Remult API config — reads `X-Dev-User` header, looks up dev user
- Restricted admin panel: `admin: () => remult.isAllowed(Roles.admin)`
- Added permissions to Task entity: authenticated read, authenticated insert, owner-or-admin update, admin-only delete, row-level `apiPrefilter`, `createdBy` field auto-set via `saving` hook
- Created Angular `DevAuthService` with signal state + localStorage persistence
- Created functional `HttpInterceptorFn` to attach `X-Dev-User` header
- Wired `remult.initUser()` in `provideAppInitializer`
- Created dev user switcher UI component (fixed bottom-right, amber styling)
- App reloads data on user switch via `remult.subscribeAuth()`

**What changes when Entra ID comes:** Replace `getUser` body with JWT/OIDC verification, replace `DevAuthService` + interceptor with token-based auth, delete dev-users.ts and switcher component. All entity permissions stay untouched.

## Stage 7: Build Out Angular Feature Structure

- Set up `core/`, `shared/`, `features/` folders under `apps/web/src/app/`
- Create lazy-loaded feature routes
- Adopt modern Angular patterns: signals, `input()`, `inject()`, `@if`/`@for`, zoneless

## Stage 8: Expand the Domain

- Add more entities grouped by domain (projects, users, etc.)
- Add `@BackendMethod` operations on entities
- Add cross-entity operations files where needed
- Add relations, lifecycle hooks, field-level permissions

## Stage 9: Wire Up Real Authentication (Entra ID)

- Replace dev auth middleware with JWT/OIDC verification in Hono
- Add MSAL or equivalent auth library to Angular
- Replace `DevAuthService` with real auth service
- Replace dev interceptor with Bearer token interceptor
- Delete dev-users.ts and dev user switcher component
- Add login/logout flow
