// Flat config for the marketing site.
//
// This app is a standalone install: its own lockfile, Astro 7 and Vite 8, which
// cannot share hoisting with the workspace app shells. That is why the root
// config ignores `apps/marketing/**` and this file exists instead of a shared
// one. It is also why the ESLint dependencies here are duplicated rather than
// hoisted — deliberate, not an oversight.
//
// Same philosophy as the root config: the linter catches BUGS, Prettier owns
// formatting, and pre-existing violations live in a suppression baseline so
// adoption does not turn into a fixing exercise.
//
// Deliberately NOT type-aware. The type-checked rule set buys most of its value
// in the API and core packages, where a dropped await loses a ledger write.
// This is a static marketing site with no async domain logic, and wiring the
// TypeScript project service through astro-eslint-parser's virtual TSX is cost
// without a matching payoff.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.astro/**', '.wrangler/**', 'public/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,

  {
    files: ['**/*.{ts,astro}'],
    rules: {
      // TypeScript resolves identifiers itself, and does it correctly for types
      // and ambient declarations. Same reasoning as the root config.
      'no-undef': 'off',

      // --- error: unambiguous bugs, not taste. Same set as the root config,
      // minus the rules that need type information.
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      'no-constant-binary-expression': 'error',

      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Astro frontmatter and client scripts both run against browser globals; the
  // build glue (astro.config.mjs, scripts/) runs in Node.
  {
    files: ['src/**/*.{ts,astro}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
