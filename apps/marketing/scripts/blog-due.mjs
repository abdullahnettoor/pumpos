#!/usr/bin/env node
/**
 * Decides whether pumpos.app needs a rebuild for the blog: compares the posts
 * that should be live now (not draft, publishedAt passed) with the posts in
 * the live RSS feed. Same rule as `isLive` in src/blog.ts.
 *
 * Usage: node scripts/blog-due.mjs https://pumpos.app
 * Exits 0 when pumpos.app is up to date and 1 when a rebuild is due, like diff.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const site = process.argv[2];
if (!site) {
  console.error('usage: blog-due.mjs <site-url>');
  process.exit(2);
}

const blogDir = new URL('../src/content/blog/', import.meta.url).pathname;
const now = new Date();

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function field(frontmatter, name) {
  const match = frontmatter.match(new RegExp(`^${name}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm'));
  return match?.[1];
}

const expected = files(blogDir)
  .filter((file) => /\.mdx?$/.test(file))
  .flatMap((file) => {
    const frontmatter = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const publishedAt = new Date(field(frontmatter, 'publishedAt'));
    const live = field(frontmatter, 'draft') !== 'true' && publishedAt <= now;
    const id = field(frontmatter, 'slug') ?? relative(blogDir, file).replace(/\.mdx?$/, '');
    if (id !== id.toLowerCase() || /\s/.test(id)) {
      console.warn(`::warning::${file}: use a lowercase-hyphenated file name; its URL may not match "${id}"`);
    }
    return live ? [id] : [];
  })
  .sort();

let liveIds = null;
try {
  const response = await fetch(new URL('/rss.xml', site));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  liveIds = [...xml.matchAll(/<link>[^<]*\/blog\/([^<]+?)\/?<\/link>/g)].map((m) => m[1]).sort();
} catch (error) {
  console.warn(`::warning::Could not read ${site}/rss.xml (${error.message}); deploying to be safe.`);
}

const due = liveIds === null || expected.join('\n') !== liveIds.join('\n');
console.log(JSON.stringify({ now: now.toISOString(), expected, live: liveIds, due }, null, 2));
process.exit(due ? 1 : 0);
