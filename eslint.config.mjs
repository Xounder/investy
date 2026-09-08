import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint flat config for all workspace packages (apps/*, packages/*).
 * Packages run `eslint .` from their own directory; ESLint resolves this
 * config by walking up to the workspace root.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/blob-report/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);