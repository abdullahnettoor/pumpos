#!/usr/bin/env node
// Derives every URL-addressed icon from the canonical mark in
// `brand/pumpos-mark.svg`: `npm run brand:icons`.
//
// Why derive rather than hand-author each one: the icons this replaces were
// an SVG `<rect>` with a `<text>` element in the brand typeface. That font is
// not loaded in a browser tab, a home-screen install or an app switcher, so
// every icon silently fell back to a system face and shipped a letter in the
// wrong typeface. Nothing here depends on a font — the mark is a path.
//
// The container lockup (mark knocked out of a brand-green tile) is written to
// `brand/` alongside the mark so it is inspectable and fannable, but it is
// derived, not authored: the mark path is the single source of truth for the
// geometry, and `brand-icons.test.mjs` holds the derivation to its contract.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Brand primary, the same token the design system and the inline mark use. */
export const BRAND_PRIMARY = '#1F6A53';

/** The mark is knocked out of the tile, so it takes the surface color. */
export const BRAND_ON_PRIMARY = '#ffffff';

/**
 * Mark height as a share of the canvas, for icons a platform shows as drawn.
 *
 * Roomier than the maskable variant because nothing is going to crop it — at a
 * favicon's 16px the mark needs the size for the nozzle cutout to read at all.
 */
export const CONTAINER_MARK_FRACTION = 0.62;

/**
 * Mark height as a share of the canvas, for the maskable variant.
 *
 * Android masks a maskable icon to a circle or squircle and guarantees only
 * the central 80% survives. Sized so the mark's *diagonal* fits that circle —
 * see `markSafeRadius`, which is what the test actually asserts.
 */
export const MASKABLE_SAFE_FRACTION = 0.52;

/** Corner radius as a share of the canvas, matching the iOS tile convention. */
export const CONTAINER_CORNER_FRACTION = 2 / 9;

/** Canonical artwork, and the container lockup derived from it. */
export const MARK_SOURCE = 'brand/pumpos-mark.svg';
export const CONTAINER_SOURCE = 'brand/pumpos-container.svg';

/**
 * Reads the path and viewBox out of the canonical mark.
 *
 * `packages/ui` exports the same geometry as `MARK_PATH` / `MARK_VIEWBOX`, but
 * this is a plain `.mjs` script with no build step and cannot import from a
 * package that has to be compiled first. `brand/pumpos-mark.svg` is the shared
 * source of truth either way — the UI package's own test asserts its component
 * matches this same file, so neither copy can drift from it unnoticed.
 *
 * Deliberately strict: a silent miss here would emit a correctly-sized, wholly
 * blank icon, which is worse than the letter it replaces because it looks
 * deliberate.
 */
export function parseMarkArtwork(svg) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg);
  if (!viewBox) throw new Error(`${MARK_SOURCE}: no viewBox to size the mark from`);

  // Exactly one path, not merely the first: the mark is a single compound path
  // whose nozzle is a knockout, so a second path means this is not the artwork
  // we think it is — and taking the first would silently ship half the mark,
  // baked into fifty-odd committed rasters. The marketing site's
  // `parseBrandMark` checks the same file the same way, for the same reason.
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)];
  if (paths.length !== 1) {
    throw new Error(
      `${MARK_SOURCE}: expected exactly one <path> to draw, found ${paths.length}. ` +
        'Run `npm run brand` from the repo root to restore it.',
    );
  }

  const [minX, minY, width, height] = viewBox[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`${MARK_SOURCE}: unreadable viewBox "${viewBox[1]}"`);
  }

  return { path: paths[0][1], viewBox: { minX, minY, width, height } };
}

/** Where the mark lands on the canvas, shared by the composer and the safe-zone check. */
function placeMark({ mark, size, markHeightFraction }) {
  const scale = (size * markHeightFraction) / mark.viewBox.height;
  const width = mark.viewBox.width * scale;
  const height = mark.viewBox.height * scale;
  return { scale, width, height, x: (size - width) / 2, y: (size - height) / 2 };
}

/** Trims float noise so the emitted SVG stays readable and diffs stay quiet. */
const round = (n) => Number(n.toFixed(4));

/**
 * The radius the mark actually occupies, measured centre to furthest corner.
 *
 * A mask is a circle, so what escapes it is the artwork's diagonal — checking
 * height alone would pass an icon whose corners get shaved off.
 */
export function markSafeRadius({ mark, size, markHeightFraction }) {
  const { width, height } = placeMark({ mark, size, markHeightFraction });
  return Math.hypot(width, height) / 2;
}

/**
 * A brand-green tile with the mark knocked out of it.
 *
 * `cornerRadius: 0` is not a style choice — it is what a maskable or
 * apple-touch icon needs, because the platform applies its own rounding and
 * would otherwise round an already-rounded tile.
 */
export function composeContainerIcon({
  mark,
  size,
  background = BRAND_PRIMARY,
  foreground = BRAND_ON_PRIMARY,
  cornerRadius,
  markHeightFraction,
}) {
  const { scale, x, y } = placeMark({ mark, size, markHeightFraction });
  const rx = cornerRadius > 0 ? ` rx="${round(cornerRadius)}"` : '';
  const tx = round(x - mark.viewBox.minX * scale);
  const ty = round(y - mark.viewBox.minY * scale);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="PumpOS">
  <rect width="${size}" height="${size}"${rx} fill="${background}"/>
  <g transform="translate(${tx} ${ty}) scale(${round(scale)})">
    <path d="${mark.path}" fill="${foreground}" fill-rule="evenodd" clip-rule="evenodd"/>
  </g>
</svg>
`;
}

/**
 * Every icon derived from the mark, and the shape each platform needs.
 *
 * The apple-touch icon and the desktop master are the only rasters: iOS
 * ignores an SVG in `apple-touch-icon`, which is why the current install looks
 * wrong on iPhone despite the file existing, and the Tauri bundler generates
 * its set from a PNG master. Everything else stays vector.
 */
export function planIcons() {
  const tile = (size, cornerRadius, markHeightFraction = CONTAINER_MARK_FRACTION) => ({
    size,
    cornerRadius,
    markHeightFraction,
    format: 'svg',
  });
  const rounded = (size) => tile(size, size * CONTAINER_CORNER_FRACTION);
  const squared = (size, markHeightFraction) => tile(size, 0, markHeightFraction);

  return [
    // Seeds the rasters below and stands as the inspectable container artwork.
    // NOT fanned out by `npm run brand`: no app requests it by URL — the
    // favicons use the bare mark — so shipping it to four `public/` dirs would
    // be dead bytes.
    { path: CONTAINER_SOURCE, ...rounded(512) },
    { path: 'apps/mobile/public/favicon.svg', ...rounded(64) },
    { path: 'apps/mobile/public/icon-192.svg', ...rounded(192) },
    { path: 'apps/mobile/public/icon-512.svg', ...squared(512, MASKABLE_SAFE_FRACTION) },
    { path: 'apps/mobile/public/apple-touch-icon.png', ...squared(180), format: 'png' },
    // Master for `npm run icons:desktop`, which fans it into the bundle set.
    { path: 'brand/pumpos-icon-1024.png', ...rounded(1024), format: 'png' },
  ];
}

/** Rasterises an SVG, loading sharp only when something actually needs a PNG. */
async function rasterise(svg, size) {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svg), { density: 512 }).resize(size, size).png().toBuffer();
}

/** The bytes one plan entry should hold, vector or raster. */
async function renderIcon(entry, mark) {
  const svg = composeContainerIcon({ mark, ...entry });
  return entry.format === 'png' ? rasterise(svg, entry.size) : Buffer.from(svg);
}

/**
 * Writes every derived icon.
 *
 * Idempotent by comparison rather than blind overwrite, matching
 * `sync-brand.mjs`: these files are committed and CI does not regenerate them,
 * so a re-run must not churn a PNG's bytes and drag binaries into an unrelated
 * diff. Reports which files actually moved.
 */
export async function buildBrandIcons({
  root,
  plan = planIcons(),
  fs = { mkdir, readFile, writeFile },
}) {
  const mark = parseMarkArtwork(await fs.readFile(join(root, MARK_SOURCE), 'utf8'));
  const written = [];
  const unchanged = [];

  for (const entry of plan) {
    const bytes = await renderIcon(entry, mark);
    const destination = join(root, entry.path);

    if (await matches(fs, destination, bytes)) {
      unchanged.push(entry.path);
      continue;
    }
    await fs.mkdir(dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
    written.push(entry.path);
  }

  return { written, unchanged };
}

async function matches(fs, path, bytes) {
  try {
    return Buffer.from(await fs.readFile(path)).equals(bytes);
  } catch {
    return false;
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { written, unchanged } = await buildBrandIcons({ root });
  for (const path of written) console.log(`✓ ${path}`);
  for (const path of unchanged) console.log(`· ${path} (unchanged)`);
  if (written.length) console.log('Run `npm run icons:desktop` to refresh the desktop bundle set.');
  console.log(`Brand icons: ${written.length} written, ${unchanged.length} already current.`);
}
