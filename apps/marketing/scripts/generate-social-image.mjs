import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Raster social cards work across crawlers that do not support SVG previews.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#1f6a53"/>
<g transform="translate(65 51) scale(.8)" fill="#fff"><path fill-rule="evenodd" d="M9 8h34l13 13v18L43 52H23v7H9V8Zm14 13v18h15l5-5v-8l-5-5H23Z"/></g>
<text x="126" y="89" fill="white" font-family="Arial, sans-serif" font-size="34" font-weight="600">PumpOS</text>
<path d="M70 125H1130" stroke="#70a38e" stroke-width="1"/>
<g font-family="Arial, sans-serif" font-size="76" font-weight="700" fill="white"><text x="70" y="253">Your station.</text><text x="70" y="348">Your numbers.</text><text x="70" y="443" fill="#d5e8dd">No waiting.</text></g>
<text x="73" y="555" fill="#d5e8dd" font-family="Arial, sans-serif" font-size="22">The operating system for fuel retail.</text>
<g transform="translate(858 190) scale(4.6)" fill="#d5e8dd"><path fill-rule="evenodd" d="M9 8h34l13 13v18L43 52H23v7H9V8Zm14 13v18h15l5-5v-8l-5-5H23Z"/></g>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL('../public/og-default.png', import.meta.url)));
console.log('Generated public/og-default.png (1200 × 630)');
