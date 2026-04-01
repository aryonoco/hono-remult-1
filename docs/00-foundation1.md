# Full-Stack TypeScript Architecture Guide
## Hono · Angular · Remult · NX

---

## Core Philosophy

**Define once. Enforce everywhere.**

This architecture replicates the F#/SAFE stack experience in TypeScript. The Remult entity is the single source of truth — it defines your data model, validation rules, authorization policies, and business operations in one place. Both frontend and backend import the same entity class. There is no duplication.

---

## Guiding Principles

### 1. The Entity IS the API Contract

A Remult entity is not just a data model. It is simultaneously:

- The TypeScript type (compile-time safety)
- The database schema (auto-migration capable)
- The REST API endpoints (auto-generated CRUD)
- The validation rules (run on both client and server)
- The authorization policy (row-level and field-level)
- The business operations (BackendMethods)

When you define a `Task` entity, you get `/api/tasks` endpoints, type-safe queries from Angular, validation that runs identically in the browser and on the server, and permission checks that apply everywhere.

### 2. No Separate Controllers

Business logic belongs on the entity it operates on. Use `@BackendMethod` decorators directly on entity classes:

- **Instance methods** for operations on a specific entity (archive, approve, submit)
- **Static methods** for collection operations (bulk update, reports, aggregations)

The only exception: cross-domain operations that don't belong to any single entity. These go in a minimal operations file within the relevant domain folder — not a controllers directory.

### 3. Validation Runs Isomorphically

Remult validators execute the same code on frontend and backend. Define validation once in the entity field decorator. Angular calls `repo.validate()` before submission; the server validates again on save. No separate validation schemas, no drift between client and server rules.

### 4. Authorization is Declarative

Permissions are declared on the entity, not scattered across middleware and guards:

- `allowApiCrud` — who can perform CRUD operations
- `allowApiRead/Insert/Update/Delete` — granular operation control
- `apiPrefilter` — row-level security (users only see their own data)
- `allowApiUpdate` on fields — field-level write protection

Angular can introspect these permissions via entity metadata to conditionally render UI.

### 5. Minimal NX Structure

NX provides monorepo tooling, not architectural complexity. Use the minimum structure that enables code sharing:

- One shared library for entities
- One Angular application
- One Hono application
- Module boundary rules to prevent platform leakage

---

## Directory Structure

```
workspace/
├── apps/
│   ├── web/                          # Angular application
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── app.component.ts
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── app.routes.ts
│   │   │   │   │
│   │   │   │   ├── core/             # App-wide singletons
│   │   │   │   │   ├── auth.interceptor.ts
│   │   │   │   │   └── remult.provider.ts
│   │   │   │   │
│   │   │   │   ├── shared/           # Reusable UI components
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── directives/
│   │   │   │   │   └── pipes/
│   │   │   │   │
│   │   │   │   └── features/         # Feature modules (lazy-loaded)
│   │   │   │       ├── tasks/
│   │   │   │       │   ├── task-list.component.ts
│   │   │   │       │   ├── task-form.component.ts
│   │   │   │       │   └── tasks.routes.ts
│   │   │   │       ├── projects/
│   │   │   │       └── auth/
│   │   │   │
│   │   │   └── main.ts
│   │   └── project.json
│   │
│   └── api/                          # Hono application
│       ├── src/
│       │   ├── main.ts               # Hono app + Remult mount
│       │   ├── middleware/
│       │   │   ├── auth.ts           # JWT verification
│       │   │   └── cors.ts
│       │   └── routes/               # Non-Remult routes only
│       │       └── auth.routes.ts    # OAuth callbacks, token refresh
│       └── project.json
│
├── libs/
│   └── shared/
│       └── domain/                   # THE source of truth
│           ├── src/
│           │   ├── index.ts          # Barrel export
│           │   │
│           │   ├── core/             # Cross-cutting entities
│           │   │   ├── user.ts
│           │   │   └── organization.ts
│           │   │
│           │   ├── tasks/            # Task domain
│           │   │   ├── task.ts
│           │   │   ├── task-comment.ts
│           │   │   └── task.operations.ts  # Cross-entity ops (if needed)
│           │   │
│           │   └── projects/         # Project domain
│           │       ├── project.ts
│           │       └── project-member.ts
│           │
│           └── project.json
│
├── nx.json
├── tsconfig.base.json
└── package.json
```

---

## Architecture Layers

### Layer 1: Shared Domain (libs/shared/domain)

This is the heart of the architecture. Every entity lives here.

**What goes here:**
- Entity classes with `@Entity` decorator
- Field definitions with validation
- Relations between entities
- Entity-level permissions
- BackendMethods (instance and static)
- Cross-entity operations files (minimal, only when truly needed)

**What does NOT go here:**
- Angular components or services
- Hono middleware or routes
- Environment configuration
- Platform-specific code

**Organization pattern:** Group by domain, not by type. All task-related entities live in `tasks/`, all project-related entities in `projects/`. This keeps related code together and makes it easy to find things.

### Layer 2: API Application (apps/api)

A thin shell that mounts Remult and handles platform concerns.

**What goes here:**
- Hono application setup
- Remult API mount with entity registration
- JWT/OIDC middleware
- CORS configuration
- Non-Remult routes (OAuth callbacks, webhooks, file uploads)
- Database connection configuration

**What does NOT go here:**
- Business logic (belongs on entities)
- Validation rules (belongs on entities)
- Authorization logic (belongs on entities)

The API application should be minimal. Remult auto-generates all CRUD endpoints. Custom routes are only for things Remult doesn't handle: authentication flows, file uploads, external webhooks.

### Layer 3: Web Application (apps/web)

Angular consumes the shared entities directly.

**What goes here:**
- Standalone components
- Route definitions
- UI-specific services (toast notifications, modal management)
- Auth interceptor (attaches JWT to requests)
- Feature components organized by domain

**What does NOT go here:**
- Data fetching services (use Remult repository directly)
- Duplicate type definitions (import from shared)
- Validation logic (call `repo.validate()`)

---

## Key Patterns

### Entity Pattern

Each entity file is self-contained:

1. **Entity decorator** — table name, CRUD permissions, row-level security
2. **Fields** — with types, validation, UI metadata (caption, inputType)
3. **Relations** — to other entities
4. **Lifecycle hooks** — saving, saved, deleting (for audit, computed fields)
5. **BackendMethods** — business operations that run server-side

### Angular Component Pattern (Modern Angular 21)

- **Standalone components only** — no NgModules
- **Signals for state** — `signal()`, `computed()`, not BehaviorSubject
- **Signal inputs** — `input()` function, not `@Input()` decorator
- **inject() function** — not constructor injection
- **Built-in control flow** — `@if`, `@for`, `@defer`, not `*ngIf`, `*ngFor`
- **Zoneless** — no Zone.js dependency

### Data Flow Pattern

1. Angular component imports entity from `@workspace/shared-domain`
2. Component creates repository: `repo = remult.repo(Task)`
3. Component subscribes to LiveQuery for real-time updates
4. User action calls repository method or BackendMethod
5. Remult handles HTTP, validation, authorization
6. LiveQuery automatically updates all connected clients

### Form Pattern

1. Import entity from shared domain
2. Read field metadata: `repo.metadata.fields`
3. Generate form fields from metadata (caption, inputType, validation)
4. On submit, call `repo.validate(data)` for client-side check
5. Call `repo.save(data)` — server validates again

### Authentication Pattern

1. Hono middleware extracts JWT from Authorization header
2. Middleware verifies token and sets user in context
3. Remult `getUser` function reads user from Hono context
4. `remult.user` is available in all entity decorators
5. Permissions like `allowApiUpdate: (entity) => entity.ownerId === remult.user?.id` just work

---

## Module Boundaries

Configure NX to enforce architectural rules:

**Tags:**
- `scope:shared` — platform-agnostic code (entities)
- `scope:web` — Angular application
- `scope:api` — Hono application

**Rules:**
- `scope:shared` can only depend on `scope:shared`
- `scope:web` can depend on `scope:shared` and `scope:web`
- `scope:api` can depend on `scope:shared` and `scope:api`
- `scope:shared` cannot import from `@angular/*`, `hono`, or Node APIs

This prevents entities from accidentally importing platform-specific code, which would break the shared model.

---

## What Stays Separate

Despite maximum sharing, some code is inherently platform-specific:

| Web Application | API Application |
|-----------------|-----------------|
| Components, templates | Hono middleware |
| Route guards | Database connection |
| UI state (modals, toasts) | OAuth callbacks |
| Styling | Webhook handlers |
| Build configuration | Environment secrets |

This separation is natural and correct. The goal is not to share everything — it's to share everything that CAN be shared, and clearly separate what cannot.

---

## Comparison to F#/SAFE Stack

| SAFE Stack | This Architecture |
|------------|-------------------|
| Shared F# types | Remult entity classes |
| Fable.Remoting | BackendMethods |
| Server-side validation | Entity validators (isomorphic) |
| Giraffe/Saturn routing | Hono + Remult auto-routes |
| Elmish | Angular signals |
| F# type safety | TypeScript + Remult metadata |
| Paket | npm/pnpm |
| FAKE | NX task runner |

The philosophy is identical: define your domain model once, let the framework derive everything else. The implementation differs by language and ecosystem, but the developer experience — write it once, trust it everywhere — is preserved.

---

## Summary

**Structure:** Three folders — `libs/shared/domain` for entities, `apps/api` for Hono, `apps/web` for Angular.

**Entities:** Self-contained with fields, validation, permissions, and business logic. No separate controllers.

**Angular:** Modern patterns — signals, standalone, zoneless, inject(). Import entities directly, use repository for data access.

**Hono:** Minimal shell. Mount Remult, configure auth middleware, done.

**NX:** Enforces boundaries. Shared code stays platform-agnostic.

**Result:** Define your data model once. Get type safety, validation, authorization, and API endpoints everywhere. No duplication.