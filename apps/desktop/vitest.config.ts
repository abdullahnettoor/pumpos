import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    // Most desktop tests are plain logic (build-environment resolution, the
    // update coordinator's state machine) and run at node speed. The update
    // notice has to be observed the way an operator sees it, so `*.dom.test.tsx`
    // files opt into jsdom with a `@vitest-environment` docblock — the same
    // split `packages/ui` uses.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
