import neverthrowPlugin from '@bufferings/eslint-plugin-neverthrow';
import nxPlugin from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.spec.ts', '.nx/**', '.angular/**'],
  },
  {
    files: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.ts', 'libs/shared/domain/src/**/*.ts'],
    plugins: {
      '@nx': nxPlugin,
      neverthrow: neverthrowPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'neverthrow/must-use-result': 'error',
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
    },
  },
);
