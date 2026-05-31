# Module Boundaries

Three scope tags partition the workspace and are enforced by `@nx/enforce-module-boundaries`.
The shared domain library is the single source of truth and is consumed through one path alias.

## Scope Tags

Each project carries exactly one `scope:*` tag in its `project.json`.

| Project         | Path                  | Tag            |
| --------------- | --------------------- | -------------- |
| `web`           | `apps/web/`           | `scope:web`    |
| `api`           | `apps/api/`           | `scope:api`    |
| `shared-domain` | `libs/shared/domain/` | `scope:shared` |

**Pattern:** Declare the tag in `project.json`.

```jsonc
// libs/shared/domain/project.json
{
  "name": "shared-domain",
  "projectType": "library",
  "tags": ["scope:shared"]
}
```

## Enforced Constraints

The rule lives in the flat ESLint config and applies to the source of all three projects.

**Pattern:** `@nx/enforce-module-boundaries` with one `depConstraints` entry per scope.

```js
// eslint.config.mjs
'@nx/enforce-module-boundaries': [
  'error',
  {
    enforceBuildableLibDependency: false,
    allow: [],
    depConstraints: [
      {
        sourceTag: 'scope:shared',
        onlyDependOnLibsWithTags: ['scope:shared'],
        bannedExternalImports: ['@angular/*', 'hono', 'hono/*'],
      },
      {
        sourceTag: 'scope:web',
        onlyDependOnLibsWithTags: ['scope:shared', 'scope:web'],
        bannedExternalImports: ['hono', 'hono/*'],
      },
      {
        sourceTag: 'scope:api',
        onlyDependOnLibsWithTags: ['scope:shared', 'scope:api'],
        bannedExternalImports: ['@angular/*'],
      },
    ],
  },
],
```

What each constraint means:

- **`scope:shared`** — isomorphic domain only. May depend on `scope:shared` libs and must not
  import `@angular/*`, `hono`, or `hono/*`. Only `remult` and `neverthrow` are expected external
  dependencies.
- **`scope:web`** — Angular app. May depend on `scope:shared` and `scope:web`; the Hono server
  is banned.
- **`scope:api`** — Hono app. May depend on `scope:shared` and `scope:api`; Angular is banned.

**Avoid:** importing a banned package across a boundary. ESLint fails the `lint` target (and
therefore `bun run check:ci`), so this never reaches a commit.

```ts
// libs/shared/domain/src/... — WRONG, scope:shared cannot import Angular or Hono
import { signal } from '@angular/core';
import { Hono } from 'hono';
```

## Consuming the Shared Library

Both apps import the shared entities through one alias, not via a deep relative path.

**Pattern:** Classic `baseUrl` + `paths` alias in `tsconfig.base.json`.

```jsonc
// tsconfig.base.json
"compilerOptions": {
  "baseUrl": ".",
  "paths": {
    "@workspace/shared-domain": ["libs/shared/domain/src/index.ts"]
  }
}
```

**Pattern:** Import the alias from web or api code.

```ts
import { FireIncident } from '@workspace/shared-domain';
```

**Avoid:** reaching into the library with a relative path — it bypasses the public barrel and
the alias.

```ts
// WRONG — import through the alias, not a relative deep path
import { FireIncident } from '../../../libs/shared/domain/src/fire/fire-incident';
```

Every entity is re-exported from `libs/shared/domain/src/index.ts`; that barrel is what the
alias resolves to.

This is classic path mapping, **not** TypeScript project references. There is no `@nx/js`
plugin and no `tsconfig` `references` array, so `nx sync` / `nx sync:check` does nothing here and
must not be added to any gate.
