// Flat config (the only format ESLint 10 supports — .eslintrc was removed).
//
// Philosophy: the linter is here to catch BUGS, not to have opinions about
// style. Formatting belongs to Prettier, and anything that merely bikesheds is
// a warning at most.
//
// Two severities, deliberately:
//   error -> a real correctness risk. The CI baseline is ZERO. These block.
//   warn  -> worth cleaning up, never blocks a merge.
//
// The `error` set is chosen for THIS codebase: a multi-tenant financial ledger
// where a dropped `await` inside runInTransaction can commit state without its
// outbox event, and a stale React closure can show an operator the wrong
// drawer balance. TypeScript catches neither.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    // Global ignores. Build output, vendored code, and the standalone
    // marketing app (own lockfile + Astro toolchain, not in the workspace).
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/.astro/**',
      '**/worker-configuration.d.ts',
      '**/src-tauri/**',
      'apps/marketing/**',
      'packages/db/drizzle/**',
      // Not application code: agent tooling, vendored bundles, and the
      // hand-written service worker (browser globals, no module system).
      '.agents/**',
      '.opencode/**',
      '**/public/**',
      '**/*.umd.js',
      '**/*.min.js',
    ],
  },

  js.configs.recommended,

  // Type-aware linting. `projectService: true` asks TypeScript's own service
  // for each file's types, which handles this repo's composite project
  // references far better than enumerating tsconfigs by hand.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ---------------------------------------------------------------------
  // Severity policy
  // ---------------------------------------------------------------------
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // TypeScript already resolves identifiers, and it does it correctly for
      // types and ambient declarations. `no-undef` only produces false
      // positives here — this is typescript-eslint's own recommendation.
      'no-undef': 'off',

      // --- error: async correctness. The whole reason for type-aware linting.
      // A floating promise in a use-case or repository adapter means the
      // transaction/outbox write may not have happened when we say it has.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // --- error: unambiguous bugs, not taste.
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      'no-constant-binary-expression': 'error',

      // --- warn: real signal, but a large pre-existing backlog. Cleaning
      // these up is worthwhile; blocking every PR on them is not.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/unbound-method': 'warn',

      // Unused code is a warning; `_`-prefixed args are an intentional signal.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // tsc already enforces this and disagrees with the lint rule on
      // `interface extends`, so defer to the compiler.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // ---------------------------------------------------------------------
  // React surfaces (shared UI + the three app shells that consume it)
  // ---------------------------------------------------------------------
  {
    files: [
      'packages/ui/**/*.{ts,tsx}',
      'apps/console/**/*.{ts,tsx}',
      'apps/desktop/**/*.{ts,tsx}',
      'apps/mobile/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // A stale closure in a TanStack Query hook or Zustand store can render
      // last shift's numbers. This one earns `error`.
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // ---------------------------------------------------------------------
  // Server / Node surfaces
  // ---------------------------------------------------------------------
  {
    files: ['apps/api/**/*.ts', 'packages/{core,db,shared}/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Tests: assertion helpers and fixtures legitimately do unsafe things.
  // They also sit OUTSIDE the build tsconfigs (packages/core excludes
  // `src/**/*.test.ts`), so the type service has no program for them — hence
  // type-aware rules must be switched off or every test file is a parse error.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**', '**/__tests__/**'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Build/deploy glue that no tsconfig includes (vite configs, Cloudflare
  // Worker entrypoints). Same reason as tests: no program, no type info.
  {
    files: ['**/*.config.{ts,mts,cts}', '**/worker/**/*.ts', '**/scripts/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Plain JS/config files never get type-aware rules — they have no tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
);
