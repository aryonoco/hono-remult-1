---
name: nx-workspace
description: "Nx 22 task running, inferred vs explicit targets (Project Crystal), and module-boundary conventions for
  this Bun monorepo. Use when running or adding Nx targets, editing project.json/nx.json, or reasoning about scopes."
user-invocable: false
---

# Nx Workspace

Covers Nx 22 with Project Crystal in this Bun monorepo: how tasks run through `bunx`,
which targets are plugin-inferred versus explicitly declared, caching and continuous dev
servers, and the `scope:*` module-boundary rules enforced by ESLint. The repo uses classic
`baseUrl` + `paths` (not TypeScript project references), so there is no `@nx/js` plugin and no
`nx sync` step.

## References

- [Task running](task-running.md) — `bunx nx serve/test/run-many`, `affected -t`, per-project
  executors, gates, caching, continuous servers
- [Module boundaries](module-boundaries.md) — `scope:*` tags, `@nx/enforce-module-boundaries`,
  the `@workspace/shared-domain` path alias

## Decision Trees

### Running a task

| Need                              | Command                                            |
| --------------------------------- | -------------------------------------------------- |
| One project, one target           | `bunx nx serve web` / `bunx nx test shared-domain` |
| Same target across all projects   | `bunx nx run-many -t test`                         |
| Only projects touched by the diff | `bunx nx affected -t build`                        |
| Several targets at once           | `bunx nx affected -t lint test build`              |

### Adding a target

| Situation                                | How                                                          |
| ---------------------------------------- | ------------------------------------------------------------ |
| Tool already has an Nx plugin            | Register the plugin in `nx.json` → target is inferred        |
| Bun / Angular builder, no inference      | Add an explicit target in `project.json`                     |
| Tweak one property of an inferred target | Override that key in `project.json`; the rest stays inferred |
| Set a default for many projects          | Add it to `targetDefaults` in `nx.json`                      |

### Target configuration knobs

| Need                    | Key                                       |
| ----------------------- | ----------------------------------------- |
| Cache the target output | `"cache": true`                           |
| Long-running dev server | `"continuous": true`                      |
| Run dependencies first  | `"dependsOn": ["^build"]`                 |
| Limit cache inputs      | `"inputs": ["production", "^production"]` |

### Which gate to run

| Goal                  | Command                                             |
| --------------------- | --------------------------------------------------- |
| Fast pre-commit gate  | `bun run check:ci` (biome ci + eslint + `tsc -b`)   |
| Full gate before a PR | `just ci` (adds cspell, markdownlint, tests, build) |

## Key Principles

1. **Bun, not npm** — always `bunx nx ...` and `bun run ...`; never `npx`, `npm`, `yarn`, or
   `pnpm`
2. **Space form for targets** — `affected -t build`, never the legacy colon form `affected:build`
3. **Project Crystal inference** — the `lint` target is inferred by `@nx/eslint/plugin`; never
   duplicate it in a `project.json`
4. **Explicit where there is no plugin** — `build`, `serve`, and `test` are declared per project
   because the Angular builders and `bun build` are not auto-inferred here
5. **Precedence** — inferred < `targetDefaults` < `project.json`
6. **Scopes are walls** — `scope:shared` may not import Angular or Hono; the lib is consumed via
   the `@workspace/shared-domain` alias
