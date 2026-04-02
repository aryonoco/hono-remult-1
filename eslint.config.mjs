import neverthrowPlugin from '@bufferings/eslint-plugin-neverthrow';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.spec.ts', '.nx/**', '.angular/**'],
  },
  {
    files: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.ts', 'libs/shared/domain/src/**/*.ts'],
    plugins: {
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
    },
  },
);
