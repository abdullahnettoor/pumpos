import { defineConfig } from 'vite-plus';

/**
 * Root-level tests for the repository's guard scripts.
 *
 * The workspaces each run their own vitest (`npm run test --workspaces`), and
 * `scripts/` is not a workspace, so nothing covered it. These scripts enforce
 * lint and release rules — if one silently stops working, no one finds out.
 * See #75 and #78.
 *
 * Kept apart from the root vite.config.ts (lint, fmt and staged settings) so
 * this `include` applies only to `npm run test:scripts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
});
