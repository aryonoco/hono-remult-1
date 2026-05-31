# Config

Two lanes, two configurations. The web app tests run through the Angular CLI's Vitest builder; the domain lib runs
plain Vitest in node. Both relax the same Biome rules for `*.spec.ts`.

## 1. Web Lane — @angular/build:unit-test

**Pattern:** the `test` target uses the unit-test builder with no options — its runner defaults to `vitest`
(`apps/web/project.json`).

```json
{
  "test": {
    "executor": "@angular/build:unit-test"
  }
}
```

The builder defaults to `tsConfig: tsconfig.spec.json` and `buildTarget: ::development`, builds the spec graph with the
application build system, and runs jsdom. No `vitest.config.ts`, `karma.conf.js`, or `test.ts` is needed for the web
app.

**Pattern:** when a custom Vitest config is genuinely required, point the builder at it with `runnerConfig`, and enable
coverage with `coverage`.

```json
{
  "test": {
    "executor": "@angular/build:unit-test",
    "options": {
      "runnerConfig": "apps/web/vitest.config.ts",
      "coverage": true
    }
  }
}
```

**Avoid:** the option names `configFile` and `codeCoverage` — they do not exist on this builder. The correct keys are
`runnerConfig` (string path, or `true` to auto-discover a base config) and `coverage` (boolean). The matching CLI flag
is `ng test --coverage`.

## 2. Web tsconfig.spec.json

**Pattern:** the spec tsconfig pulls in Vitest's ambient globals and includes the testing helpers
(`apps/web/tsconfig.spec.json`).

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.d.ts", "src/**/*.spec.ts", "src/testing/**/*.ts"]
}
```

`types: ["vitest/globals"]` is what makes `describe`/`it`/`expect`/`vi` type-check without imports — matching the
`globals: true` runner behaviour.

## 3. Domain Lane — vitest.config.ts

**Pattern:** the domain lib owns a minimal Vitest config: globals on, node environment, spec glob
(`libs/shared/domain/vitest.config.ts`).

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['src/**/*.spec.ts'] },
});
```

Its `tsconfig.spec.json` mirrors the web one, minus the testing-helpers glob
(`libs/shared/domain/tsconfig.spec.json`).

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.d.ts", "src/**/*.spec.ts"]
}
```

## 4. Biome Relaxations for *.spec.ts

**Pattern:** `biome.json` declares spec globals and turns off the rules that fight idiomatic test code — for the
`**/*.spec.ts` override only.

```jsonc
{
  "includes": ["**/*.spec.ts"],
  "javascript": {
    "globals": ["Bun", "describe", "it", "expect", "beforeEach", "afterEach", "beforeAll", "afterAll", "vi"]
  },
  "linter": {
    "rules": {
      "complexity": { "noExcessiveLinesPerFunction": "off" },
      "nursery": { "useExplicitType": "off" },
      "suspicious": { "noExplicitAny": "off" },
      "style": { "noNonNullAssertion": "off", "noMagicNumbers": "off" }
    }
  }
}
```

So in specs you may freely use `any`, `!` non-null assertions, magic numbers, long test functions, and omit explicit
return types. These relaxations apply **only** to `*.spec.ts` — production code still enforces every rule.

**Avoid:** relying on these relaxations in non-spec files, or adding per-line `biome-ignore` suppressions in specs when
the override already covers the rule.
