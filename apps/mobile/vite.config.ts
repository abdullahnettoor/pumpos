import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { APPEARANCE_ENABLED } from './src/theme/config.ts';
import { injectThemeFlags } from './src/theme/prepaint.ts';

/** Fills the pre-paint theme script's placeholders in index.html. */
function themePrepaint(devSwitch: boolean): Plugin {
  return {
    name: 'pump-theme-prepaint',
    transformIndexHtml: (html) =>
      injectThemeFlags(html, { devSwitch, appearanceEnabled: APPEARANCE_ENABLED }),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // The dev-only dark switch exists in `vite dev`, and in a build only when
  // explicitly opted in (e.g. a preview deploy) — never for normal production.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const devSwitch = command === 'serve' || env.VITE_THEME_DEV_SWITCH === 'true';
  return {
    plugins: [react(), tailwindcss(), themePrepaint(devSwitch)],
    server: {
      port: 3100,
    },
  };
});
