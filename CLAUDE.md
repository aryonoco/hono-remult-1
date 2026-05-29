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

## Git Commit Message Format

Git Commit messages MUST be modelled after the Linux kernel.

The subject line should use the subsystem/component: short description format, stay under 75 characters, and use
imperative mood ("fix" not "fixed" or "fixes").

The body should be wrapped at ~75 columns, explain why the change is needed (not just what it does), and be separated
from the subject by a blank line.

No AI/LLM attribution should appear in the git message.

## Development Environment

You are running in the devcontainer. Tool versions are pinned in `.mise.toml` — the single source of truth.

## TypeScript

TypeScript 5.9 strict mode plus: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
`noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`,
`allowUnreachableCode: false`. Full config in `tsconfig.base.json`.

- All Biome and typescript compiler rules are enforced as errors — fix them, do not suppress them. If a rule cannot be
  satisfied, restructure the code or ask the user for guidance

## Error Handling

Rust/OCaml-style: use `neverthrow` `Result<T, E>` / `ResultAsync<T, E>` for expected errors — never throw. The
`must-use-result` ESLint rule enforces all Results are handled. Throw only for bugs, unrecoverable failures, or at a
BackendMethod's RPC boundary (a `Result` cannot cross it) — see `.claude/skills/neverthrow/remult-integration.md`.

## Rules

- `bun run check:ci` must pass before committing (pre-commit enforces it). `just ci` is the full gate — it adds
  cspell, markdownlint, tests, and build
- **Biome** — primary linter and formatter for TS, CSS, JSON. All rule categories set to `error`; import organisation
  via Biome assist (`organizeImports`)
- **ESLint** — `neverthrow/must-use-result` and `@nx/enforce-module-boundaries`, run in the unified `lint` target
  alongside Biome
- **Prettier** — Angular HTML templates only (`bun run format:html`). Biome excludes `*.html`
- **cspell** (en-GB; custom words in `project-words.txt`) and **markdownlint** guard spelling and Markdown
- Test files (`*.spec.ts`) relax `noExplicitAny`, `noNonNullAssertion`, `noMagicNumbers`, `useExplicitType`, and
  `noExcessiveLinesPerFunction`

## Commands

```bash
just ci                          # full gate: check + HTML-format + spell + markdownlint + test + build
bun run check:ci                 # fast gate: biome ci + eslint + tsc -b (pre-commit enforces this)
bun run check                    # biome check (lint + format + imports) with auto-fix
bunx nx serve web                # Angular dev server (port 4200)
bunx nx serve api                # Hono dev server (port 3000)
bunx nx run-many -t test         # run all tests (Vitest)
just migrate-generate <name>     # generate an Atlas migration after an entity change
```

## Architecture

**Define once, enforce everywhere.** The Remult entity is the single source of truth — type, schema, API, validation,
auth, and business logic in one class. No separate controllers. Both Angular and Hono import the same entity.

Three layers:

1. **Shared domain** (`libs/shared/domain/`) — Remult entities, isomorphic validation, permissions
2. **API** (`apps/api/`) — thin Hono shell, mounts Remult, auth middleware
3. **Web** (`apps/web/`) — Angular consumes shared entities via Remult repository

NX module boundaries enforce separation: `scope:shared` cannot import Angular or Hono code.

Full architecture guide: `docs/00-foundation1.md`. Living plan: `docs/00-plan.md`. Worked domain example:
`docs/02-fire-showcase-overview.md`.

## Persistence

Postgres via `remult/postgres` with `ensureSchema: false` — Remult never runs DDL. Atlas owns the schema; migrations
live in `apps/api/src/migrations/`. After changing an entity, run `just migrate-generate <name>` and commit the SQL.

## Angular Conventions

- Standalone components only — no NgModules
- Signals for state: `signal()`, `computed()`, not BehaviorSubject
- Signal inputs: `input()` function, not `@Input()` decorator
- `inject()` function, not constructor injection
- Built-in control flow: `@if`, `@for`, `@defer` — not `*ngIf`, `*ngFor`
- Zoneless change detection
- Lazy-loaded feature routes

## Skills & Rules

Entity conventions: `.claude/rules/entity-conventions.md`
Angular conventions: `.claude/rules/angular-conventions.md`
API conventions: `.claude/rules/api-conventions.md`
Pattern skills (invoke on demand): `.claude/skills/remult/` and `.claude/skills/neverthrow/`

When creating new entities, follow `.claude/rules/entity-conventions.md` (rules load on Read, not Write — reference the
rule when creating files).

## Project Layout

```text
apps/web/           Angular application (scope:web)
apps/api/           Hono API server (scope:api)
libs/               shared/domain/ (scope:shared)
docs/               docs
```
