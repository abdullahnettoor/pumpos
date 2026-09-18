import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRAND_PRIMARY,
  CONTAINER_SOURCE,
  MARK_SOURCE,
  MASKABLE_SAFE_FRACTION,
  buildBrandIcons,
  composeContainerIcon,
  markSafeRadius,
  parseMarkArtwork,
  planIcons,
} from './brand-icons.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MARK = {
  path: 'M0 0H10V20H0Z',
  viewBox: { minX: 0, minY: 0, width: 10, height: 20 },
};

describe('reading the canonical artwork', () => {
  it('lifts the path and viewBox out of the mark file', () => {
    const svg = `<svg viewBox="0 0 676.7 762.3" fill="#1F6A53"><path d="M1 2L3 4Z" /></svg>`;

    expect(parseMarkArtwork(svg)).toEqual({
      path: 'M1 2L3 4Z',
      viewBox: { minX: 0, minY: 0, width: 676.7, height: 762.3 },
    });
  });

  it('keeps a non-zero viewBox origin, which the icon transform has to undo', () => {
    const svg = `<svg viewBox="5 7 100 200"><path d="M0 0Z" /></svg>`;

    expect(parseMarkArtwork(svg).viewBox).toEqual({ minX: 5, minY: 7, width: 100, height: 200 });
  });

  it('refuses artwork it cannot read rather than emitting a blank icon', () => {
    expect(() => parseMarkArtwork('<svg><path d="M0 0Z"/></svg>')).toThrow(/viewBox/);
    expect(() => parseMarkArtwork('<svg viewBox="0 0 1 1"></svg>')).toThrow(/exactly one/);
  });

  it('refuses a second path rather than silently drawing half the mark', () => {
    // The mark is one compound path with the nozzle as a knockout. A file with
    // two paths is not the artwork we think it is, and taking the first would
    // bake half a mark into fifty-odd committed rasters.
    const twoPaths = '<svg viewBox="0 0 1 1"><path d="M0 0Z"/><path d="M1 1Z"/></svg>';

    expect(() => parseMarkArtwork(twoPaths)).toThrow(/expected exactly one <path>.*found 2/);
  });
});

describe('composing a container icon', () => {
  const icon = () =>
    composeContainerIcon({
      mark: MARK,
      size: 100,
      background: '#1F6A53',
      foreground: '#ffffff',
      cornerRadius: 22,
      markHeightFraction: 0.5,
    });

  it('paints a full-bleed background so the icon has no transparent edge', () => {
    // An app icon is a tile, not a glyph: the OS draws it against an unknown
    // surface, so the container must supply its own.
    expect(icon()).toContain('<rect width="100" height="100" rx="22" fill="#1F6A53"/>');
  });

  it('centres the mark and scales it to the requested share of the canvas', () => {
    // height 20 * 0.5 * 100 / 20 = 50 tall, so 25 wide; centred leaves 37.5, 25.
    expect(icon()).toContain('translate(37.5 25) scale(2.5)');
  });

  it('undoes a non-zero viewBox origin so the mark still lands centred', () => {
    const offset = composeContainerIcon({
      mark: { path: 'M0 0Z', viewBox: { minX: 4, minY: 6, width: 10, height: 20 } },
      size: 100,
      background: '#000',
      foreground: '#fff',
      cornerRadius: 0,
      markHeightFraction: 0.5,
    });

    // Same 2.5 scale, each axis pulled back by the origin it starts at.
    expect(offset).toContain(`translate(${37.5 - 4 * 2.5} ${25 - 6 * 2.5}) scale(2.5)`);
  });

  it('draws the mark even-odd, so the nozzle knocks through to the background', () => {
    // The mark is one path with the nozzle as a reversed subpath. Filled
    // even-odd, the cutout shows the container's green rather than a white
    // blob — the same trick the inline React mark uses.
    expect(icon()).toContain('fill-rule="evenodd"');
    expect(icon()).toContain('fill="#ffffff"');
  });

  it('squares the corners when asked, which is what a maskable icon needs', () => {
    const square = composeContainerIcon({
      mark: MARK,
      size: 512,
      background: '#1F6A53',
      foreground: '#fff',
      cornerRadius: 0,
      markHeightFraction: 0.5,
    });

    // Rounding a maskable icon ourselves would be double-rounded once the
    // platform applies its own circle or squircle. Let the mask do it.
    expect(square).not.toContain('rx=');
  });

  it('declares its size so a rasteriser and a browser tab agree on it', () => {
    expect(icon()).toContain('viewBox="0 0 100 100"');
    expect(icon()).toContain('width="100"');
    expect(icon()).toContain('height="100"');
  });

  it('carries no text element, so nothing depends on a font that never loads', () => {
    expect(icon()).not.toContain('<text');
    expect(icon()).not.toContain('font-family');
  });
});

describe('maskable safe zone', () => {
  it('measures the mark to its furthest corner, not its height', () => {
    // A mask is a circle; what escapes it is the diagonal of the artwork box.
    const radius = markSafeRadius({ mark: MARK, size: 100, markHeightFraction: 0.5 });

    // 20 tall * 0.5 * 100/20 = 50 tall, so 25 wide.
    expect(radius).toBeCloseTo(Math.hypot(25, 50) / 2, 6);
  });

  it('keeps the shipped maskable icon inside the central 80%', () => {
    // The real artwork, not the fixture: this is the criterion that ships, and
    // it turns on the mark's own aspect ratio.
    const mark = parseMarkArtwork(readFileSync(join(__dirname, '..', MARK_SOURCE), 'utf8'));
    const { size, markHeightFraction } = planIcons().find(
      (entry) => entry.path === 'apps/mobile/public/icon-512.svg',
    );

    // Android's maskable contract: everything essential within a circle of
    // diameter 80% of the canvas, so a circular or squircle mask cannot clip it.
    expect(markSafeRadius({ mark, size, markHeightFraction })).toBeLessThanOrEqual(size * 0.4);
  });
});

describe('the icon plan', () => {
  const plan = planIcons();
  const at = (path) => plan.find((entry) => entry.path === path);

  it('rounds the icons a platform shows as-is', () => {
    expect(at('apps/mobile/public/favicon.svg').cornerRadius).toBeGreaterThan(0);
    expect(at('apps/mobile/public/icon-192.svg').cornerRadius).toBeGreaterThan(0);
  });

  it('squares the ones a platform masks or rounds for itself', () => {
    // Android masks the 512; iOS rounds the apple-touch icon itself.
    expect(at('apps/mobile/public/icon-512.svg').cornerRadius).toBe(0);
    expect(at('apps/mobile/public/apple-touch-icon.png').cornerRadius).toBe(0);
  });

  it('holds the maskable icon to the safe fraction the mask requires', () => {
    expect(at('apps/mobile/public/icon-512.svg').markHeightFraction).toBe(MASKABLE_SAFE_FRACTION);
  });

  it('ships a 1024 master for the desktop bundle icon set', () => {
    const master = at('brand/pumpos-icon-1024.png');

    expect(master.size).toBe(1024);
    expect(master.format).toBe('png');
  });

  it('rasterises only what a platform refuses to take as SVG', () => {
    // iOS ignores an SVG apple-touch-icon, and the Tauri bundler wants a PNG
    // master. Everything else stays vector.
    expect(plan.filter((entry) => entry.format === 'png').map((entry) => entry.path)).toEqual([
      'apps/mobile/public/apple-touch-icon.png',
      'brand/pumpos-icon-1024.png',
    ]);
  });
});

describe('the committed artwork', () => {
  const root = join(__dirname, '..');
  const mark = parseMarkArtwork(readFileSync(join(root, MARK_SOURCE), 'utf8'));

  /** Re-derives an entry so a stale committed file cannot pass unnoticed. */
  const derive = (path) =>
    composeContainerIcon({ mark, ...planIcons().find((entry) => entry.path === path) });

  it.each([
    CONTAINER_SOURCE,
    'apps/mobile/public/favicon.svg',
    'apps/mobile/public/icon-192.svg',
    'apps/mobile/public/icon-512.svg',
  ])('%s matches what the mark derives today', (path) => {
    // These are generated, not authored. Editing one by hand, or changing the
    // mark without re-running the build, shows up here instead of shipping.
    expect(readFileSync(join(root, path), 'utf8')).toBe(derive(path));
  });

  it('ships no icon that depends on a font loading', () => {
    // The whole point of the change: the icons these replaced drew a letter in
    // the brand typeface, which never loads in a tab or an app switcher.
    for (const path of [
      'apps/mobile/public/favicon.svg',
      'apps/mobile/public/icon-192.svg',
      'apps/mobile/public/icon-512.svg',
    ]) {
      expect(readFileSync(join(root, path), 'utf8')).not.toMatch(/<text|font-family/);
    }
  });

  it('paints the brand primary token, so no fifth green enters the codebase', () => {
    // Asserted against the design token itself, not against the constant this
    // module exports — comparing a module to its own export proves nothing.
    const css = readFileSync(join(root, 'packages/ui/src/index.css'), 'utf8');
    const token = /--brand-primary:\s*(#[0-9a-f]{3,8})/i.exec(css);

    expect(token?.[1].toLowerCase()).toBe(BRAND_PRIMARY.toLowerCase());
    expect(derive(CONTAINER_SOURCE)).toContain(BRAND_PRIMARY);
  });
});

describe('rebuilding', () => {
  /** In-memory stand-in for the fs calls the build makes, so tests touch no disk. */
  function fakeFs(initial = {}) {
    const files = new Map(Object.entries(initial).map(([p, v]) => [p, Buffer.from(v)]));
    const writes = [];
    return {
      writes,
      async mkdir() {},
      async readFile(path, encoding) {
        const found = files.get(path);
        if (!found) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
        return encoding ? found.toString(encoding) : found;
      },
      async writeFile(path, bytes) {
        writes.push(path);
        files.set(path, Buffer.from(bytes));
      },
    };
  }

  const svgOnly = planIcons().filter((entry) => entry.format === 'svg');

  it('writes every icon when none exists yet', async () => {
    const fs = fakeFs({ [MARK_SOURCE]: readFileSync(join(__dirname, '..', MARK_SOURCE)) });

    const { written, unchanged } = await buildBrandIcons({ root: '', plan: svgOnly, fs });

    expect(written).toEqual(svgOnly.map((entry) => entry.path));
    expect(unchanged).toEqual([]);
  });

  it('rewrites nothing on a second run, so committed icons do not churn', async () => {
    // These files are committed and CI does not regenerate them. A blind
    // overwrite would drag every icon into an unrelated diff.
    const fs = fakeFs({ [MARK_SOURCE]: readFileSync(join(__dirname, '..', MARK_SOURCE)) });
    await buildBrandIcons({ root: '', plan: svgOnly, fs });
    fs.writes.length = 0;

    const { written, unchanged } = await buildBrandIcons({ root: '', plan: svgOnly, fs });

    expect(fs.writes).toEqual([]);
    expect(written).toEqual([]);
    expect(unchanged).toEqual(svgOnly.map((entry) => entry.path));
  });

  it('refuses to emit anything when the mark is unreadable', async () => {
    const fs = fakeFs({ [MARK_SOURCE]: '<svg></svg>' });

    await expect(buildBrandIcons({ root: '', plan: svgOnly, fs })).rejects.toThrow(/viewBox/);
    expect(fs.writes).toEqual([]);
  });
});
