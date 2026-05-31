# Nx Task Running

All Nx commands run through Bun in this repo. Never use `npx`, `npm`, `yarn`, or `pnpm`.

## Running Targets

**Pattern:** One project, one target.

```bash
bunx nx serve web          # Angular dev server (port 4200)
bunx nx serve api          # Hono dev server (watch mode)
bunx nx test shared-domain # Vitest for the shared lib
bunx nx build web          # production build
```

**Pattern:** Same target across every project that defines it.

```bash
bunx nx run-many -t test
bunx nx run-many -t build
```

**Pattern:** Only the projects affected by the current diff.

```bash
bunx nx affected -t build
bunx nx affected -t lint test build   # several targets in one run
```

**Avoid:** the legacy colon form. Always use the space form `-t <target>`.

```bash
bunx nx affected:build   # WRONG — legacy colon syntax
nx affected -t build     # WRONG — bare nx; this repo runs through bunx
```

`affected` compares against `defaultBase` (`main`, set in `nx.json`).

## Per-Project Executors

Targets are explicit in `project.json` except `lint`, which is inferred (see below).

**Pattern:** The web app — Angular builders for build/serve, the Angular-21-native Vitest runner
for test.

```jsonc
// apps/web/project.json
"targets": {
  "build": { "executor": "@angular/build:application", "...": "..." },
  "serve": { "executor": "@angular/build:dev-server", "...": "..." },
  "test": { "executor": "@angular/build:unit-test" }
}
```

`@angular/build:unit-test` is Angular 21's native Vitest test runner — there is no Karma or
Jest here.

**Pattern:** The API app — `bun build` and `bun --watch` as plain commands.

```jsonc
// apps/api/project.json
"targets": {
  "build": {
    "command": "bun build apps/api/src/main.ts --outdir dist/apps/api --target bun --minify",
    "outputs": ["{workspaceRoot}/dist/apps/api"]
  },
  "serve": { "command": "bun --watch apps/api/src/main.ts" }
}
```

**Pattern:** The shared lib — Vitest via `nx:run-commands`.

```jsonc
// libs/shared/domain/project.json
"targets": {
  "test": {
    "executor": "nx:run-commands",
    "options": { "command": "vitest run", "cwd": "libs/shared/domain" }
  }
}
```

## Inferred vs Explicit Targets (Project Crystal)

**Pattern:** Register a plugin to infer a target across the whole workspace. The `lint` target
is inferred by `@nx/eslint/plugin` and appears in **no** `project.json`.

```jsonc
// nx.json
"plugins": [
  {
    "plugin": "@nx/eslint/plugin",
    "options": { "targetName": "lint" }
  }
]
```

`build`, `serve`, and `test` stay explicit because the Angular builders and `bun build` are not
auto-inferred in this repo.

**Pattern:** Override a single property of an inferred target; the rest stays inferred.

```jsonc
// project.json — only this key is overridden, lint is still inferred otherwise
"targets": {
  "lint": { "options": { "maxWarnings": 0 } }
}
```

**Avoid:** redefining a plugin-inferred target wholesale in `project.json`. There is no `lint`
executor entry to copy — duplicating it defeats inference.

Precedence when the same key is set in more than one place: **inferred < `targetDefaults` <
`project.json`**.

## Caching and Continuous Servers

**Pattern:** `targetDefaults` in `nx.json` set caching, inputs, and dependency order once.

```jsonc
// nx.json
"targetDefaults": {
  "build": { "dependsOn": ["^build"], "inputs": ["production", "^production"], "cache": true },
  "serve": { "continuous": true },
  "test": { "inputs": ["default", "^production"], "cache": true }
}
```

- `"cache": true` marks a target cacheable — replays from the local cache on a hit.
- `"continuous": true` marks a long-running process (dev servers); inferred targets get it
  automatically. Use `dependsOn` to orchestrate serve chains.
- `dependsOn: ["^build"]` builds upstream dependencies first; `inputs` scope what invalidates
  the cache.

**Avoid:** the deprecated task-runner configuration. Nx 17–21 removed these; do not add them.

```jsonc
// WRONG — all removed/deprecated
"tasksRunnerOptions": {
  "default": {
    "runner": "nx/tasks-runners/default",
    "options": { "cacheableOperations": ["build", "test"] }
  }
}
```

Mark caching with `"cache": true` on the target instead.

## Gates

**Pattern:** Fast pre-commit gate — runs on every commit.

```bash
bun run check:ci   # biome ci . && nx run-many -t lint && bun run typecheck (tsc -b --noEmit)
```

**Pattern:** Full gate — run before opening a PR.

```bash
just ci            # pre-commit-run + check + HTML format + cspell + markdownlint + test + build
```

**Avoid:** adding `nx sync:check` to the gate. It is a no-op here — there is no `@nx/js` plugin,
and the repo uses classic `baseUrl` + `paths`, not TypeScript project references.
