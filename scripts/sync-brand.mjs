#!/usr/bin/env node
// Fans the canonical brand artwork in `brand/` out into each app's
// `public/brand/`, mirroring how `download-fonts.mjs` vendors the fonts.
// Run after changing anything in `brand/`: `npm run brand`.
//
// Why copy instead of import: the marketing site is a standalone Astro app and
// not an npm workspace, so it cannot import from `@pump/ui` — a file served
// from its own `public/` is the only thing that reaches it. The apps that CAN
// import the shared package still need a copy, because a favicon is requested
// by URL rather than bundled.
//
// The inline React mark (`packages/ui/src/pump-ds/brand/`) is the same artwork
// for in-app rendering, where it can inherit `currentColor`; a test there holds
// the two in sync.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Canonical artwork, relative to `brand/`. */
export const BRAND_FILES = ['pumpos-mark.svg'];

/** Every app that serves the brand over a URL. */
export const TARGET_DIRS = [
  'apps/console/public/brand',
  'apps/desktop/public/brand',
  'apps/mobile/public/brand',
  'apps/marketing/public/brand',
];

/** Expands the files × apps matrix into one entry per copy, grouped by file. */
export function planBrandSync({ files = BRAND_FILES, targets = TARGET_DIRS } = {}) {
  return files.flatMap((file) =>
    targets.map((target) => ({
      file,
      source: `brand/${file}`,
      destination: `${target}/${file}`,
    })),
  );
}

/**
 * Copies each canonical file to its destinations.
 *
 * Idempotent by comparison, not by blind overwrite: a destination already
 * holding the canonical bytes is left untouched, so a re-run is a no-op down to
 * the file mtimes and reports honestly which apps actually changed.
 */
export async function syncBrandAssets({
  root,
  plan = planBrandSync(),
  fs = { mkdir, readFile, writeFile },
} = {}) {
  const written = [];
  const unchanged = [];
  const sources = new Map();

  for (const dir of new Set(plan.map((entry) => dirname(entry.destination)))) {
    await fs.mkdir(join(root, dir), { recursive: true });
  }

  for (const entry of plan) {
    // Read each canonical file once, however many apps consume it — this is
    // also what guarantees every app gets byte-identical artwork.
    if (!sources.has(entry.source)) {
      sources.set(entry.source, await readCanonical(fs, join(root, entry.source), entry.source));
    }
    const bytes = sources.get(entry.source);
    const destination = join(root, entry.destination);

    if (await matches(fs, destination, bytes)) {
      unchanged.push(entry.destination);
      continue;
    }
    await fs.writeFile(destination, bytes);
    written.push(entry.destination);
  }

  return { written, unchanged };
}

async function readCanonical(fs, path, label) {
  try {
    return await fs.readFile(path);
  } catch (cause) {
    throw new Error(`Canonical brand file is missing: ${label}`, { cause });
  }
}

async function matches(fs, path, bytes) {
  try {
    return Buffer.from(await fs.readFile(path)).equals(Buffer.from(bytes));
  } catch {
    return false;
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { written, unchanged } = await syncBrandAssets({ root });
  for (const path of written) console.log(`✓ ${path}`);
  for (const path of unchanged) console.log(`· ${path} (unchanged)`);
  console.log(`Brand synced: ${written.length} written, ${unchanged.length} already current.`);
}
