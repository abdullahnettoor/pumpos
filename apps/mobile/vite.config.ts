import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { APPEARANCE_ENABLED, isDevSwitchEnabled } from './src/theme/config.ts';
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
  // One evaluation of the dev-switch rule, shared by the pre-paint script
  // (index.html) and the app (`define`), so they cannot disagree.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const devSwitch = isDevSwitchEnabled(command, env.VITE_THEME_DEV_SWITCH);
  return {
    define: { __PUMP_THEME_DEV_SWITCH__: JSON.stringify(devSwitch) },
    plugins: [react(), tailwindcss(), themePrepaint(devSwitch)],
    server: {
      port: 3100,
    },
  };
});
