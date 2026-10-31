#!/usr/bin/env node
/**
 * Fails when a built page links to a root-relative path, or names an og:image,
 * that is not in dist/.
 * The publish-blog workflow runs it because a post taken from dev can link to
 * a page that exists only on dev.
 *
 * Usage (after `npm run build`): node scripts/check-links.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function resolves(path) {
  const clean = decodeURIComponent(path.split(/[?#]/)[0]).replace(/^\//, '');
  if (clean === '') return true;
  return [clean, `${clean}.html`, join(clean, 'index.html')].some((candidate) =>
    existsSync(join(dist, candidate)),
  );
}

const broken = [];
for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, 'utf8');
  for (const [, url] of html.matchAll(/\s(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
    if (!resolves(url)) broken.push(`${relative(dist, file)} → ${url}`);
  }
  for (const [, url] of html.matchAll(/property="og:image" content="https?:\/\/[^/"]+(\/[^"]*)"/g)) {
    if (!resolves(url)) broken.push(`${relative(dist, file)} → og:image ${url}`);
  }
}

if (broken.length) {
  for (const line of broken) console.error(`::error::Broken link: ${line}`);
  process.exit(1);
}
console.log('All root-relative links resolve.');
