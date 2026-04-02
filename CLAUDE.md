# hono-remult-1

NX monorepo — Angular, Hono, Remult, Bun. SAFE-stack-inspired: define once, enforce everywhere.

## UNDERCOVER

NEVER include in commit messages or PR descriptions:
- The phrase "Claude Code" or any mention that you are an AI
- Co-Authored-By lines or any other attribution

BAD (never write these):
- 1-shotted by claude-opus-4-6
- Generated with Claude Code
- Co-Authored-By: Claude Opus 4.6 <…>

## TypeScript

TypeScript 5.9 strict mode plus: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, `allowUnreachableCode: false`. Full config in `tsconfig.base.json`.

- All Biome and typescript compiler rules are enforced as errors — fix them, do not suppress them. If a rule cannot be satisfied, restructure the code or ask the user for guidance


## Error Handling

Rust/OCaml-style: use `neverthrow` `Result<T, E>` / `ResultAsync<T, E>` for expected errors — never throw. The `must-use-result` ESLint rule enforces all Results are handled. Only throw for bugs or unrecoverable failures.

## Rules

- Run `bun run check:ci` before committing — it must pass clean
- **Biome** — primary linter and formatter for TS, CSS, JSON. All rule categories set to `error`
- **ESLint** — scoped to `neverthrow/must-use-result` only (`@bufferings/eslint-plugin-neverthrow`). Runs as part of the unified `lint` target alongside Biome
- **Prettier** — HTML templates only (`bun run format:html`). Biome excludes `*.html`
- Import organisation handled by Biome assist (`organizeImports`)
- Test files (`*.spec.ts`) relax `noExplicitAny` and `noNonNullAssertion` only

## Commands

```bash
bun run check:ci                    # CI gate — lint + format check (run before committing)
bun run check                       # lint + format with auto-fix
bun run lint                        # Biome lint only
bun run format                      # Biome format with write
bun run format:html                 # Prettier for Angular HTML templates
bunx nx build web                   # build Angular app
bunx nx serve web                   # dev server (port 4200)
bunx nx test web                    # run tests (Vitest)
bunx nx serve api                   # Hono dev server (port 3000)
bunx nx build api                   # bundle API for production
bunx nx graph                       # visualise dependency graph
```


## Architecture

**Define once, enforce everywhere.** The Remult entity is the single source of truth — type, schema, API, validation, auth, and business logic in one class. No separate controllers. Both Angular and Hono import the same entity.

Three layers:
1. **Shared domain** (`libs/shared/domain/`) — Remult entities, isomorphic validation, permissions
2. **API** (`apps/api/`) — thin Hono shell, mounts Remult, auth middleware
3. **Web** (`apps/web/`) — Angular consumes shared entities via Remult repository

NX module boundaries enforce separation: `scope:shared` cannot import Angular or Hono code.

Full architecture guide: `docs/00-foundation1.md`. Implementation plan: `docs/00-plan.md`.

## Angular Conventions

- Standalone components only — no NgModules
- Signals for state: `signal()`, `computed()`, not BehaviorSubject
- Signal inputs: `input()` function, not `@Input()` decorator
- `inject()` function, not constructor injection
- Built-in control flow: `@if`, `@for`, `@defer` — not `*ngIf`, `*ngFor`
- Zoneless change detection
- Lazy-loaded feature routes


- 
## Project Layout

```
apps/web/           Angular application (scope:web)
apps/api/           Hono API server (scope:api)
libs/               shared/domain/ (scope:shared)
docs/               docs
```
