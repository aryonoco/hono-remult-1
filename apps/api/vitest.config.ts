import { defineConfig } from 'vitest/config';

// Resolve the workspace path alias the same way tsconfig.base.json does so the
// api specs can import the shared domain. `import.meta.dirname` is this config's
// directory (apps/api), avoiding any node builtin import.
const sharedDomain = `${import.meta.dirname}/../../libs/shared/domain/src/index.ts`;

export default defineConfig({
  resolve: { alias: { '@workspace/shared-domain': sharedDomain } },
  test: { globals: true, environment: 'node', include: ['src/**/*.spec.ts'] },
});
