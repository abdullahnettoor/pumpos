import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBrandMark } from '../src/brand-mark.mjs';

// Raster social cards work across crawlers that do not support SVG previews.
// The card is regenerated from the canonical mark rather than a pasted copy of
// it: the previous version inlined the old artwork twice in this one file, and
// its hand-kept SVG twin had already drifted into a different design entirely.
const markFile = new URL('../public/brand/pumpos-mark.svg', import.meta.url);
const { viewBox, path: markPath } = parseBrandMark(
  readFileSync(fileURLToPath(markFile), 'utf8'),
  'public/brand/pumpos-mark.svg',
);
const [, , markWidth, markHeight] = viewBox.split(' ').map(Number);

/** Scale the mark to a given rendered height, positioned by its top-left corner. */
const mark = (x, y, height, fill) =>
  `<g transform="translate(${x} ${y}) scale(${height / markHeight})" fill="${fill}">` +
  `<path fill-rule="evenodd" d="${markPath}"/></g>`;

const LOCKUP_MARK_HEIGHT = 44;
const WATERMARK_HEIGHT = 300;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#1f6a53"/>
${mark(70, 45, LOCKUP_MARK_HEIGHT, '#fff')}
<text x="${Math.round(70 + (markWidth / markHeight) * LOCKUP_MARK_HEIGHT + 18)}" y="80" fill="white" font-family="Arial, sans-serif" font-size="34" font-weight="600">PumpOS</text>
<path d="M70 125H1130" stroke="#70a38e" stroke-width="1"/>
<g font-family="Arial, sans-serif" font-size="76" font-weight="700" fill="white"><text x="70" y="253">Your station.</text><text x="70" y="348">Your numbers.</text><text x="70" y="443" fill="#d5e8dd">No waiting.</text></g>
<text x="73" y="555" fill="#d5e8dd" font-family="Arial, sans-serif" font-size="22">The operating system for fuel retail.</text>
${mark(875, 175, WATERMARK_HEIGHT, '#2c7a63')}
</svg>`;

await sharp(Buffer.from(svg))
  .png()
  .toFile(fileURLToPath(new URL('../public/og-default.png', import.meta.url)));
console.log('Generated public/og-default.png (1200 × 630)');
