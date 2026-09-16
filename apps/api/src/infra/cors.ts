/**
 * Which browser origins the API will answer with CORS headers.
 *
 * Kept as a pure function so the allow-list can be tested directly: a mistake
 * here is either an outage (a legitimate origin blocked, which the browser
 * reports as an unhelpful "network error") or a hole (an untrusted origin able
 * to read authenticated responses).
 */

/** Fixed origins allowed on every environment, production included. */
export const allowedCorsOrigins = new Set([
  'https://pumpos.app',
  'https://console.pumpos.app',
  'https://m.pumpos.app',
  'https://pumpos.abdullahnettoor.com',
  'https://console.pumpos.abdullahnettoor.com',
  'https://m.pumpos.abdullahnettoor.com',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]);

/**
 * A per-PR preview front end, e.g.
 * `https://pr-123-pumpos-console.acme.workers.dev`.
 *
 * Deliberately narrow: the app segment is enumerated rather than matched, the
 * PR number must be digits, and the pattern is anchored at both ends — so it
 * cannot widen to arbitrary `workers.dev` origins, which anyone can obtain.
 * Only `console` and `mobile` call the API; `marketing` is static.
 */
const PR_PREVIEW_ORIGIN = /^https:\/\/pr-\d+-pumpos-(console|mobile)\.[a-z0-9-]+\.workers\.dev$/;

/**
 * PR previews are allowed **only** against the preview API. Production keeps the
 * fixed allow-list, so a `workers.dev` origin can never read production data.
 */
export function resolveCorsOrigin(
  origin: string | undefined,
  env: { ENVIRONMENT?: string } | undefined,
): string | null {
  // Not a browser request (no Origin header): CORS does not apply.
  if (!origin) return null;
  if (allowedCorsOrigins.has(origin)) return origin;
  if (env?.ENVIRONMENT === 'preview' && PR_PREVIEW_ORIGIN.test(origin)) return origin;
  return null;
}
