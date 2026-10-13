import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { APPEARANCE_ENABLED, isDevSwitchEnabled } from '@pump/ui/theme';
import { injectThemeFlags } from '@pump/ui/theme';

/**
 * A packaged desktop build resolves its environment from `VITE_APP_ENV` alone
 * (see src/buildEnv.ts) — it cannot fall back to the serving host, which is
 * always `localhost`. So a bundle built without that variable, or with a
 * misspelled one, would silently ship as "production": right for the real
 * production release, wrong and invisible for every other packaged build.
 *
 * Refuse to produce one. `TAURI_ENV_PLATFORM` is set by the Tauri CLI when it
 * invokes this build to package an app, so the gate applies exactly to packaged
 * builds — a plain `vite build` (CI's compile check) stays unaffected.
 */
function assertPackagedBuildDeclaresEnvironment() {
  const isPackagedBuild = !!process.env.TAURI_ENV_PLATFORM;
  if (!isPackagedBuild) return;

  const declared = process.env.VITE_APP_ENV?.trim().toLowerCase();
  // Mirrors buildEnv.ts's accepted values, including its aliases. Kept here as
  // a literal because a vite config cannot import the app's TypeScript source.
  const accepted = ['local', 'development', 'dev', 'preview', 'production', 'prod'];
  if (!declared || !accepted.includes(declared)) {
    throw new Error(
      `VITE_APP_ENV must be one of: ${accepted.join(', ')} when packaging the desktop app ` +
        `(got ${declared ? `"${process.env.VITE_APP_ENV ?? ''}"` : 'no value'}). ` +
        'The packaged app has no other way to tell its environment — ' +
        'see apps/desktop/src/buildEnv.ts.',
    );
  }
}

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
  if (command === 'build') assertPackagedBuildDeclaresEnvironment();
  const devSwitch = isDevSwitchEnabled(command, process.env.VITE_THEME_DEV_SWITCH);

  return {
    plugins: [react(), tailwindcss(), themePrepaint(devSwitch)],
    define: {
      __PUMP_THEME_DEV_SWITCH__: JSON.stringify(devSwitch),
    },
    // Prevent Vite from obscuring Rust errors
    clearScreen: false,
    // Tauri expects a fixed port, fail if that port is already in use
    server: {
      port: 1420,
      strictPort: true,
    },
    // To make use of `TAURI_PLATFORM`, `TAURI_ARCH`, `TAURI_FAMILY`,
    // `TAURI_PLATFORM_VERSION`, `TAURI_PLATFORM_TYPE` and `TAURI_DEBUG`
    // env variables in webview code
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
      // Tauri supports es2021
      target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      // don't minify for debug builds
      minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
      // produce sourcemaps for debug builds
      sourcemap: !!process.env.TAURI_DEBUG,
    },
  };
});
