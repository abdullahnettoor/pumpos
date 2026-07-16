/**
 * Environment-driven external hosts for the marketing site.
 *
 * Defaults point at the CURRENT domain (pumpos.abdullahnettoor.com). At
 * go-live, set the build var `PUBLIC_CONSOLE_URL=https://console.pumpos.app`
 * (and `SITE=https://pumpos.app` for the sitemap/canonical) — no code change.
 */
export const CONSOLE_URL: string =
  import.meta.env.PUBLIC_CONSOLE_URL ?? 'https://console.pumpos.abdullahnettoor.com';
