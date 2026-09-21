import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Local-only platform back-office.
 *
 * Bound to 127.0.0.1 on purpose: this app drives destructive platform
 * operations against production, so it must not be reachable from the local
 * network. Port 5173 is fixed because the API's CORS allow-list names it
 * explicitly (`apps/api/src/infra/cors.ts`) — a different port is silently
 * rejected by the browser as a "network error".
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
