import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Same define as vite.config.ts, so the version footer renders under test.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    // Mirrors packages/ui: node by default, jsdom opted into per file via the
    // `.dom.test.tsx` suffix plus a `@vitest-environment` docblock.
    environment: 'node',
    environmentMatchGlobs: [['**/*.dom.test.tsx', 'jsdom']],
  },
});
