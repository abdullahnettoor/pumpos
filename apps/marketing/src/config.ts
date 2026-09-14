/**
 * Environment-driven external hosts for the marketing site.
 *
 * Defaults point at the CURRENT domain (pumpos.abdullahnettoor.com). At
 * go-live, set the build var `PUBLIC_CONSOLE_URL=https://console.pumpos.app`
 * (and `SITE=https://pumpos.app` for the sitemap/canonical) — no code change.
 */
export const CONSOLE_URL: string =
  import.meta.env.PUBLIC_CONSOLE_URL || 'https://console.pumpos.abdullahnettoor.com';

/**
 * Where the download page fetches the installer manifest. Defaults to the
 * bundled placeholder; set `PUBLIC_DOWNLOAD_MANIFEST_URL` to the R2 manifest
 * (`<R2_PUBLIC_BASE>/downloads/manifest.json`) once desktop releases publish
 * there. The R2 bucket must allow CORS GET from this site's origin.
 */
export const DOWNLOAD_MANIFEST_URL: string =
  import.meta.env.PUBLIC_DOWNLOAD_MANIFEST_URL || '/downloads/manifest.json';

// Optional hosted scheduler. An unset URL uses a truthful email invitation.
function bookingUrl(value: string | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}
export const DEMO_BOOKING_URL = bookingUrl(import.meta.env.PUBLIC_DEMO_BOOKING_URL);
