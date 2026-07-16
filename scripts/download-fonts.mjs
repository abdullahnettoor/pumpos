#!/usr/bin/env node
// Vendors IBM Plex Sans + Mono TTFs into the apps' public/fonts so the web app,
// desktop app, and PDF reports all use the same local fonts (offline, no CDN).
// Run once: `node scripts/download-fonts.mjs`
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://cdn.jsdelivr.net/gh/IBM/plex';
const files = {
  'IBMPlexSans-Regular.ttf': `${base}/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-Regular.ttf`,
  'IBMPlexSans-Medium.ttf': `${base}/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-Medium.ttf`,
  'IBMPlexSans-SemiBold.ttf': `${base}/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-SemiBold.ttf`,
  'IBMPlexMono-Regular.ttf': `${base}/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf`,
  'IBMPlexMono-Medium.ttf': `${base}/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Medium.ttf`,
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
