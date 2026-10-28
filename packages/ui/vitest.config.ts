import { configDefaults, defineConfig } from 'vite-plus';
import { workspaceSourceAliases } from '../../vitest.aliases.config';

export default defineConfig({
  resolve: { alias: workspaceSourceAliases },
  test: {
    // Most tests here are plain logic and run fine under node, but the auth
    // bootstrap regression tests have to observe what an operator would see
    // after effects settle — a spinner clearing, a login route appearing —
    // which needs a DOM. jsdom is per-file opt-in via `@vitest-environment`
    // docblocks, so the logic tests keep running at node speed.
    environment: 'node',
    // `tsc -b` emits compiled copies of the tests into dist/; run only the source.
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
