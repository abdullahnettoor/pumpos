import { configDefaults, defineConfig } from 'vite-plus';
import { workspaceSourceAliases } from '../../vitest.aliases.config';

export default defineConfig({
  resolve: { alias: workspaceSourceAliases },
  // `tsc -b` emits compiled copies of the tests into dist/; run only the source.
  test: {
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
