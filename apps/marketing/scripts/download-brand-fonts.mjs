// Vendor only the two approved marketing families and their open-source licences.
// Run from apps/marketing: node scripts/download-brand-fonts.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = new URL('../public/fonts/brand/', import.meta.url);
const files = {
  'barlow-semi-condensed-600.woff2': 'https://fonts.gstatic.com/s/barlowsemicondensed/v16/wlpigxjLBV1hqnzfr-F8sEYMB0Yybp0mudRfp66_B2sl.woff2',
  'public-sans-variable.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource-variable/public-sans@5.2.7/files/public-sans-latin-wght-normal.woff2',
  'Barlow-OFL.txt': 'https://raw.githubusercontent.com/google/fonts/main/ofl/barlowsemicondensed/OFL.txt',
  'PublicSans-OFL.txt': 'https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/OFL.txt',
  'plus-jakarta-sans-variable.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource-variable/plus-jakarta-sans@5.2.8/files/plus-jakarta-sans-latin-wght-normal.woff2',
  'geist-mono-variable.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.2.6/files/geist-mono-latin-wght-normal.woff2',
  'PlusJakartaSans-OFL.txt': 'https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt',
  'GeistMono-OFL.txt': 'https://raw.githubusercontent.com/google/fonts/main/ofl/geistmono/OFL.txt',
};

await mkdir(target, { recursive: true });
for (const [name, url] of Object.entries(files)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (name.endsWith('.woff2') && bytes.toString('ascii', 0, 4) !== 'wOF2') {
    throw new Error(`${name}: response is not a WOFF2 font`);
  }
  await writeFile(new URL(name, target), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
console.log(`Brand fonts available at ${fileURLToPath(target)}`);
