// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Production apex. Overridden per-deploy via the SITE env var so the dev custom
// domain (pumpos.abdullahnettoor.com) gets a correct sitemap/canonical too.
const site = process.env.SITE ?? 'https://pumpos.app';

// https://astro.build/config
export default defineConfig({
  site,
  output: 'static',
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
