# EMI Current Stack vs. Fullstack TypeScript
## DX & Development Pace Comparison

---

## Context

This document contrasts the current Emergency Incidents (EMI) architecture — Angular 16 + .NET 8 in an Nx monorepo — with the proposed fullstack TypeScript architecture (Hono, Remult, Bun, Angular). The focus is developer experience and development pace.

EMI is a production system managing fire, biosecurity, and class-two incidents. It consists of 28 apps and 28 shared libraries under `apps/emergency-incidents/` and `libs/emergency-incidents/`, with 8 ASP.NET Core REST APIs, 8 Azure Function Apps, and 5 Angular SPAs.

---

## The Core Problem: Artifact Count Per Feature

### Adding a field today (EMI)

Adding `estimatedContainmentDate` to a fire incident touches approximately:

1. Property on C# model in `libs/emergency-incidents/fire-models/`
2. Property on ViewModel in `libs/emergency-incidents/fire-view-models/`
3. AutoMapper profile to map between them
4. Repository update if Cosmos query logic is involved
5. Service interface and implementation update
6. Controller method update (if exposed differently)
7. Run `swagger` Nx target to regenerate the OpenAPI spec
8. Run `codegen` Nx target to regenerate the TypeScript client (requires Java)
9. Consume the new field from the regenerated client in Angular
10. Add validation in the Angular form (Formly field config)
11. Add validation in the C# service layer
12. Write xUnit tests for the backend
13. Write Jest tests for the frontend

That is **two languages, 10-13 touchpoints, across 5-6 projects**. The code generation step (Swagger to OpenAPI Generator to TypeScript) is the most fragile link — it requires Java, custom templates in `tools/openapi-generator-templates/`.

### Adding a field in the proposed stack

1. Add field to entity in `libs/shared/domain/` with validation decorator
2. Use it in the Angular component

Two files. One language. Validation runs identically on both sides. The API endpoint already exists. The type is already available in Angular because it is a direct import — no generation step.

---

## Dimension-by-Dimension Breakdown

### 1. Ceremony-to-Feature Ratio

**EMI today:** High. The Service/Repository pattern with interfaces-for-everything means every piece of business logic requires at minimum: an interface, an implementation, DI registration, and a controller method. The 28 apps + 28 libs structure reflects this — separate `-models`, `-view-models`, `-api-client` projects per domain. That is organizational overhead that compounds.

**Proposed:** A Remult entity replaces the model, viewmodel, AutoMapper profile, repository, service interface, service implementation, and controller. `@BackendMethod` replaces the controller-to-service-to-repository chain. ~6 layers collapse to ~1.

**Impact on pace:** This is the single biggest accelerator. Not because any individual layer is hard, but because the cognitive cost of "where does this go?" and the mechanical cost of "now update the other 5 places" dominates day-to-day work.

### 2. The Language Boundary

**EMI today:** C# backend, TypeScript frontend. The bridge is OpenAPI codegen — a build-time process that produces generated code under `libs/generated/emergency-incidents/`. This means:

- Types exist in two forms (C# class + generated TS interface) and can drift
- Validation logic is written twice (C# service + Angular Formly config)
- Two mental models, two test frameworks (xUnit + Jest), two package ecosystems (NuGet + npm)
- Nx has to bridge both with `@nx-dotnet/core`, custom generators, and dual build pipelines

**Proposed:** One language. The entity class imported in the Angular component is literally the same object the server uses. No generation, no drift, no "the backend changed the enum but the frontend hasn't regenerated yet" bugs.

**Impact on pace:** Eliminates an entire class of integration bugs and removes the codegen pipeline as a bottleneck. Any developer can work across the full stack without context-switching languages.

### 3. Validation & Authorization

**EMI today:** Validation is scattered. C# services do their own checks; Angular Formly field configs define separate validation; `FFMVic.Auth.Library` handles RBAC with permission enums, `IPermissionService`, and `[Authorize]` attributes. Permission checks live in controllers, services, and custom `PermissionCustomiser` classes for Cosmos filtering. A developer adding a permission check has to think about multiple enforcement points.

**Proposed:** Validation is on the entity field — runs isomorphically. Authorization is declarative on the entity decorator (`allowApiCrud`, `apiPrefilter`). Angular can introspect `repo.metadata` to conditionally show/hide UI. One place to look, one place to change.

**Impact on pace:** Reduces security review surface. Eliminates "forgot to add the permission check on the backend" bugs. Frontend devs know what is allowed without reading backend code.

### 4. State Management & Data Fetching

**EMI today:** RxJS-based reactive services with `BehaviorSubject`/`ReplaySubject`, manual HTTP calls through generated API clients, custom `distinctUntilChangedWithDeepCompare()` operators, loading interceptors, and manual cache management (FusionCache on the backend). Every feature needs a service that wraps the generated client, manages loading state, and handles errors.

**Proposed:** `remult.repo(Entity)` with LiveQuery gives real-time reactive data out of the box. Angular signals for local state. No hand-written data-fetching services, no loading interceptors, no manual cache invalidation.

**Impact on pace:** Removes a whole category of boilerplate. The "write a service that calls the API, manages loading state, and exposes an observable" pattern that repeats across every feature disappears.

### 5. Project Structure & Cognitive Load

**EMI today:** 56 projects under `emergency-incidents` alone. A new developer has to understand the relationship between `fire-models`, `fire-view-models`, `fire-api`, `fire-api-http` (generated), and `fire-ui` — and that pattern repeats for biosecurity, class-two, dashboard, workforce, etc. Custom Nx generators in `tools/local-nx-plugin/` help scaffold this, but the scaffolding exists because the structure is complex enough to need it.

**Proposed:** 3 top-level folders. `libs/shared/domain/` organized by domain aggregate. `apps/api/` is a thin Hono shell. `apps/web/` is Angular. Module boundary enforcement via Nx tags is simpler because there are only 3 scopes. The Nx generators become unnecessary because there is not enough structure to need generation.

**Impact on pace:** Faster onboarding. Less time navigating. Less time asking "which project does this go in?"

### 6. Build & Tooling Pipeline

**EMI today:** Nx orchestrates .NET builds (via `@nx-dotnet/core`), Angular builds, Swagger generation, OpenAPI codegen (requiring Java), and deployments. Azure DevOps artifacts for private NuGet + npm feeds. Remote caching via Azure Blob Storage. GitHub Actions with self-hosted runners per environment. Windows build cache pre-warming workflow.

**Proposed:** Single-language Nx workspace. No .NET build. No Java for codegen. No Swagger targets. No generated code to check for staleness. Bun as runtime simplifies the server-side story. The build pipeline shrinks to: lint, test, build — all in one language, one toolchain.

**Impact on pace:** Faster CI. Fewer moving parts to break. No more "the codegen step failed because Java version X" or "the .NET restore is slow because of the private NuGet feed."

---

## Summary Table

| Dimension | Current EMI | Proposed Stack | DX Delta |
|---|---|---|---|
| Artifacts per feature | 10-13 across 5-6 projects | 2-3 across 2 projects | Massive reduction |
| Language boundary | C# and TypeScript via codegen | TypeScript only | Eliminated |
| Validation | Written twice, can drift | Written once, isomorphic | Single source of truth |
| Authorization | Scattered across layers | Declarative on entity | Consolidated |
| Data fetching | Manual services + generated clients | `remult.repo()` + LiveQuery | Near-zero boilerplate |
| Project count (per domain) | ~5-6 projects | ~1 shared + 2 apps | ~80% reduction |
| Build pipeline | .NET + Angular + Java codegen | TypeScript-only Nx | Radically simpler |
| Onboarding surface | 56 EMI projects, two languages | 3 folders, one language | Much faster ramp |

---

## Honest Scrutiny: Where the Proposed Stack Needs Care

The comparison above is heavily favorable to the new stack, and it should be — reducing duplication and ceremony is almost always a net win. But some areas deserve caution:

### Cosmos DB Integration

EMI relies heavily on Azure Cosmos DB with a custom `CosmosModelMigrator`, ETags for optimistic concurrency, and per-incident-type databases. Remult supports several databases but Cosmos support depth needs verification — or this migration is also a database migration.

### Azure Functions & Background Workers

EMI has 8+ function apps for event processing, archiving, predictions, and Service Bus consumers. Remult + Hono does not natively replace event-driven background workers. Something is still needed for async job processing. Bun's maturity for long-running Azure Function workloads is worth validating.

### Complex Domain Logic

The fire-api has `DomainExtendedPermissionsService`, multi-step report generation (QuestPDF), and cross-service orchestration (ROSE resource requests via Service Bus). Not everything is CRUD. `@BackendMethod` handles custom operations well, but the team should not feel forced to shoehorn complex workflows into entity methods.

### Team Transition

The current team has deep .NET expertise (EF Core, ASP.NET, Azure Functions). Moving to fullstack TypeScript is not just a framework swap — it is a platform shift. The DX gains are real, but they only materialize once the team is fluent in the new patterns.

### Maturity & Ecosystem

Remult is a smaller ecosystem than ASP.NET Core + EF Core. The FFMVic auth library, the Tarnook change notifications, the Cosmos migrator — these are built against .NET primitives. Their equivalents in the new stack either need building or replacing with different approaches.

---

## Bottom Line

The fundamental shift is from **"define in C#, generate the bridge, consume in TypeScript"** to **"define once in TypeScript, import directly."** Every layer removed is not just less code — it is fewer bugs, fewer decisions, faster reviews, and faster onboarding. The EMI codebase is not badly built; it is doing what a .NET + Angular architecture requires. The proposed stack simply requires less.
