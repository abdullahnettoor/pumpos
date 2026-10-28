import { defineConfig, type Plugin, lazyPlugins } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { APPEARANCE_ENABLED, isDevSwitchEnabled } from '@pump/ui/theme';
import { injectThemeFlags } from '@pump/ui/theme';
import pkg from './package.json' with { type: 'json' };

/** Fills the pre-paint theme script's placeholders in index.html. */
function themePrepaint(devSwitch: boolean): Plugin {
  return {
    name: 'pump-theme-prepaint',
    transformIndexHtml: (html) =>
      injectThemeFlags(html, { devSwitch, appearanceEnabled: APPEARANCE_ENABLED }),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const devSwitch = isDevSwitchEnabled(command, process.env.VITE_THEME_DEV_SWITCH);

  return {
    plugins: lazyPlugins(() => [react(), tailwindcss(), themePrepaint(devSwitch)]),
    // The web console has no in-app updater, but the status bar still shows the
    // installed version (#263). Bake it in from package.json at build time.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __PUMP_THEME_DEV_SWITCH__: JSON.stringify(devSwitch),
    },
    server: {
      port: 3000,
    },
  };
});
