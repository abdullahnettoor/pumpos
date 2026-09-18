import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MARK_FILE, parseBrandMark } from '../src/brand-mark.mjs';

// Raster social cards work across crawlers that do not support SVG previews.
// The card is generated from the canonical mark rather than a pasted copy of
// it: the previous version inlined the old artwork twice in this one file, and
// its hand-kept SVG twin had already drifted into a different design entirely.
const markFile = new URL(`../${MARK_FILE}`, import.meta.url);
const { viewBox, path: markPath } = parseBrandMark(readFileSync(fileURLToPath(markFile), 'utf8'));
const [, , markWidth, markHeight] = viewBox.split(' ').map(Number);

/** Draw the mark at a given rendered height, positioned by its top-left corner. */
const renderMark = (x, y, height, fill, opacity = 1) =>
  `<g transform="translate(${x} ${y}) scale(${height / markHeight})" fill="${fill}" fill-opacity="${opacity}">` +
  `<path fill-rule="evenodd" d="${markPath}"/></g>`;

/** Site palette. The card introduces no colour of its own. */
const BRAND = '#1f6a53';
const MINT = '#d5e8dd';

const LOCKUP = { x: 70, y: 45, height: 44, gap: 18, baseline: 80 };
const WATERMARK = { x: 875, y: 175, height: 300, opacity: 0.12 };

const wordmarkX = Math.round(LOCKUP.x + (markWidth / markHeight) * LOCKUP.height + LOCKUP.gap);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${BRAND}"/>
${renderMark(LOCKUP.x, LOCKUP.y, LOCKUP.height, '#fff')}
<text x="${wordmarkX}" y="${LOCKUP.baseline}" fill="white" font-family="Arial, sans-serif" font-size="34" font-weight="600">PumpOS</text>
<path d="M70 125H1130" stroke="#70a38e" stroke-width="1"/>
<g font-family="Arial, sans-serif" font-size="76" font-weight="700" fill="white"><text x="70" y="253">Your station.</text><text x="70" y="348">Your numbers.</text><text x="70" y="443" fill="${MINT}">No waiting.</text></g>
<text x="73" y="555" fill="${MINT}" font-family="Arial, sans-serif" font-size="22">The operating system for fuel retail.</text>
${renderMark(WATERMARK.x, WATERMARK.y, WATERMARK.height, MINT, WATERMARK.opacity)}
</svg>`;

await sharp(Buffer.from(svg))
  .png()
  .toFile(fileURLToPath(new URL('../public/og-default.png', import.meta.url)));
console.log('Generated public/og-default.png (1200 × 630)');
