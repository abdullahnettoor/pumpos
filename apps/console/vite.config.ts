import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The web console has no in-app updater, but the status bar still shows the
  // installed version (#263). Bake it in from package.json at build time.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
  },
});
