import { configDefaults, defineConfig } from 'vite-plus';

export default defineConfig({
  // `tsc -b` emits compiled copies of the tests into dist/; run only the source.
  test: {
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
