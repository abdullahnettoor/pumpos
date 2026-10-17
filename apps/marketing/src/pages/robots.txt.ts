import type { APIRoute } from 'astro';

// Generated so the sitemap URL always matches the deploy host (Astro.site,
// driven by the SITE env var) — no hardcoded domain to update at go-live.
// Preview builds (PUBLIC_NOINDEX) still allow crawling, so search engines can
// read each page's noindex tag, but stop advertising the sitemap.
export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL('https://pumpos.abdullahnettoor.com')).toString().replace(/\/$/, '');
  const sitemap = import.meta.env.PUBLIC_NOINDEX === 'true' ? '' : `\nSitemap: ${base}/sitemap-index.xml\n`;
  const body = `User-agent: *
Allow: /
${sitemap}`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
