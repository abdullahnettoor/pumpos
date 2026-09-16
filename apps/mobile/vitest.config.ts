import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Mirrors packages/ui: node by default, jsdom opted into per file via the
    // `.dom.test.tsx` suffix plus a `@vitest-environment` docblock.
    environment: 'node',
    environmentMatchGlobs: [['**/*.dom.test.tsx', 'jsdom']],
  },
});
