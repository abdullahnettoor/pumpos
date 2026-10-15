/**
 * THROWAWAY visual harness config (never committed). Spreads the desktop vite
 * config, moves it off Tauri's fixed port, and points @pump/ui / @pump/shared
 * at their live sources so edits in the worktree show up without a rebuild.
 * Set HARNESS_DIST=1 to use the compiled dist/ instead.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import desktopConfig from '../vite.config';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repo = path.resolve(desktopDir, '../..');
const port = Number(process.env.HARNESS_PORT || 1430);

export default defineConfig((env) => {
  const base = (
    typeof desktopConfig === 'function' ? (desktopConfig as any)(env) : desktopConfig
  ) as UserConfig;
  const alias = process.env.HARNESS_DIST
    ? []
    : [
        { find: /^@pump\/ui$/, replacement: path.join(repo, 'packages/ui/src/index.ts') },
        { find: /^@pump\/shared$/, replacement: path.join(repo, 'packages/shared/src/index.ts') },
      ];
  return mergeConfig(base, {
    root: desktopDir,
    server: { port, strictPort: true },
    resolve: { alias },
  } satisfies UserConfig);
});
