import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // apps/web (Next.js + JSX) is linted/typechecked by its own toolchain.
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', 'apps/web/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Allow intentionally-unused args/vars prefixed with _ (e.g. Express error
      // middleware's required 4th `next` parameter).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
