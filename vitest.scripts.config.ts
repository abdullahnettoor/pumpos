import { defineConfig } from 'vitest/config';

/**
 * Root-level tests for the repository's guard scripts.
 *
 * The workspaces each run their own vitest (`npm run test --workspaces`), and
 * `scripts/` is not a workspace, so nothing covered it. These scripts enforce
 * the lint ratchet — if one silently stops working, the number it protects goes
 * back to meaning nothing and no one finds out. See #75 and #78.
 *
 * Deliberately NOT named `vitest.config.ts`: vitest resolves config by walking
 * up from the working directory, so a root config is picked up by the
 * workspaces that have none of their own (apps/api, packages/core,
 * packages/shared) — and this `include` would then match none of their tests,
 * failing them with "No test files found". Run it via `npm run test:scripts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
});
