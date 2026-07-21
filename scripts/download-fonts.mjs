#!/usr/bin/env node
// Vendors Plus Jakarta Sans + Geist Mono TTFs into the apps' public/fonts so
// the console, desktop, and mobile apps plus the react-pdf reports all use the
// same local fonts (offline, no CDN at runtime). Run once: `node scripts/download-fonts.mjs`.
//
// Note: react-pdf has NO glyph fallback and the reports render the Indian Rupee
// sign (₹, U+20B9) in the MONO font, so the mono MUST include it. Geist Mono and
// Plus Jakarta Sans both do; JetBrains/Roboto/Spline mono do NOT — don't use them.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Static-weight TTFs (react-pdf needs static TTF, not woff2 or variable fonts).
const expo = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts';
const geist = 'https://cdn.jsdelivr.net/npm/geist/dist/fonts/geist-mono';
const files = {
  'PlusJakartaSans-Regular.ttf': `${expo}/plus-jakarta-sans/PlusJakartaSans_400Regular.ttf`,
  'PlusJakartaSans-Medium.ttf': `${expo}/plus-jakarta-sans/PlusJakartaSans_500Medium.ttf`,
  'PlusJakartaSans-SemiBold.ttf': `${expo}/plus-jakarta-sans/PlusJakartaSans_600SemiBold.ttf`,
  'PlusJakartaSans-Bold.ttf': `${expo}/plus-jakarta-sans/PlusJakartaSans_700Bold.ttf`,
  'GeistMono-Regular.ttf': `${geist}/GeistMono-Regular.ttf`,
  'GeistMono-Medium.ttf': `${geist}/GeistMono-Medium.ttf`,
};
const targets = ['apps/console/public/fonts', 'apps/mobile/public/fonts', 'apps/desktop/public/fonts'];

for (const t of targets) await mkdir(join(root, t), { recursive: true });
for (const [name, url] of Object.entries(files)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  for (const t of targets) await writeFile(join(root, t, name), buf);
  console.log(`✓ ${name} (${buf.length} bytes)`);
}
console.log('Fonts vendored to', targets.join(' + '));
