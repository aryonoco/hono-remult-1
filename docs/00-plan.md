# Implementation Plan

## Current State

A standalone Angular 21 app in `test-app-1/` with biome, Tailwind, and strict TypeScript. No monorepo, no backend, no Remult.

---

## Stage 1: Convert to NX Monorepo

- Initialize an NX workspace
- Move the Angular app into `apps/web/`
- Configure `tsconfig.base.json` with path aliases (e.g. `@workspace/shared-domain`)
- Verify the Angular app still builds and serves

## Stage 2: Create the Shared Domain Library

- Create `libs/shared/domain/` with `project.json`, `tsconfig`, and barrel `index.ts`
- Tag it `scope:shared` in NX
- This is empty for now — just the shell

## Stage 3: Add Hono API Application

- Install `hono`
- Create `apps/api/` with a minimal `main.ts` (hello world route)
- Add build/serve scripts (esbuild or tsx for dev)
- Tag it `scope:api`

## Stage 4: Add Remult and Create First Entity

- Install `remult`
- Define a simple entity (e.g. `Task`) in `libs/shared/domain/src/tasks/task.ts`
- Mount Remult on the Hono app, register the entity
- Connect Angular to the Remult API (`remult.provider.ts` with `HttpClient` adapter)
- Verify: Angular can CRUD tasks through auto-generated endpoints

## Stage 5: Set Up Module Boundary Enforcement

- Assign NX tags: `scope:shared`, `scope:web`, `scope:api`
- Configure boundary rules so `shared` can't import Angular or Hono code
- Validate with `nx lint`

## Stage 6: Wire Up Authentication Pattern

- Add JWT middleware to Hono
- Create Angular auth interceptor to attach tokens
- Add `getUser` to Remult config
- Add permission decorators to entities (`allowApiCrud`, `apiPrefilter`, etc.)

## Stage 7: Build Out Angular Feature Structure

- Set up `core/`, `shared/`, `features/` folders under `apps/web/src/app/`
- Create lazy-loaded feature routes
- Adopt modern Angular patterns: signals, `input()`, `inject()`, `@if`/`@for`, zoneless

## Stage 8: Expand the Domain

- Add more entities grouped by domain (projects, users, etc.)
- Add `@BackendMethod` operations on entities
- Add cross-entity operations files where needed
- Add relations, lifecycle hooks, field-level permissions
