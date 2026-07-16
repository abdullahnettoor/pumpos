import type { APIRoute } from 'astro';

// Generated so the sitemap URL always matches the deploy host (Astro.site,
// driven by the SITE env var) — no hardcoded domain to update at go-live.
export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL('https://pumpos.abdullahnettoor.com')).toString().replace(/\/$/, '');
  const body = `User-agent: *
Allow: /

Sitemap: ${base}/sitemap-index.xml
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
