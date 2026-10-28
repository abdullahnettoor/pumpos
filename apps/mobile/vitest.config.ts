import { defineConfig } from 'vite-plus';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Same define as vite.config.ts, so the version footer renders under test.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    // Mirrors packages/ui: node by default, jsdom opted into per file via a
    // `@vitest-environment` docblock (by convention in `.dom.test.tsx` files).
    environment: 'node',
  },
});
