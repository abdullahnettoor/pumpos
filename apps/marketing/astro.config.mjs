// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

// Canonical site host. Defaults to the CURRENT domain; overridden per-deploy
// via the SITE env var (set SITE=https://pumpos.app at go-live) so the
// sitemap/canonical/OG URLs are correct.
const site = process.env.SITE ?? 'https://pumpos.abdullahnettoor.com';

// https://astro.build/config
export default defineConfig({
  site,
  output: 'static',
  integrations: [mdx(), sitemap({ filter: (page) => !/\/(?:404|legal\/)/.test(page) }), pagefind()],
  vite: {
    plugins: [tailwindcss()],
  },
});
