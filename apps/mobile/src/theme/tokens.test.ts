import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STATUS_BAR_STYLES, THEME_COLORS } from './config.js';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const bridge = readFileSync(fileURLToPath(new URL('./tailwind.css', import.meta.url)), 'utf8');

/** Custom properties declared in the rule whose selector list matches `selector`. */
function declarations(selector: RegExp): Record<string, string> {
  const rule = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!rule) throw new Error(`rule not found: ${selector}`);
  const out: Record<string, string> = {};
  for (const m of rule[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = declarations(/:root,\s*:root\.light/);
const dark = declarations(/:root\.dark/);

const CHART = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'];

/** The semantic token contract later tickets build on (names are fixed by #389). */
const REQUIRED = [
  'background',
  'card',
  'card-alt',
  'line',
  'line-strong',
  'text-high',
  'text-muted',
  'text-faint',
  'accent',
  'on-accent',
  'accent-soft',
  'good',
  'bad',
  'warn',
  'info',
  'bad-fg',
  'warn-fg',
  'scrim',
  'shadow-sheet',
  'shadow-chip',
  'good-soft',
  'good-line',
  'bad-soft',
  'bad-line',
  'warn-soft',
  'warn-line',
  'hero',
  'dock',
  'track',
  ...CHART,
].map((n) => `--${n}`);

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s token set', (name, t) => {
  it('defines every semantic token', () => {
    for (const token of REQUIRED) expect(t[token], `${name} ${token}`).toBeTruthy();
  });

  it('keeps the primary text legible (AA) on canvas and cards', () => {
    for (const fg of ['--text-high', '--text-default', '--text-muted']) {
      for (const bg of ['--background', '--card', '--card-alt']) {
        expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps faint text above 3:1 (tertiary / non-essential only)', () => {
    for (const bg of ['--background', '--card']) {
      expect(contrast(t['--text-faint'], t[bg]), `faint on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps accent, good and info legible (AA) on canvas, cards and their soft surfaces', () => {
    for (const fg of ['--accent', '--good', '--info']) {
      for (const bg of ['--background', '--card']) {
        expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const [fg, bg] of [
      ['--accent', '--accent-soft'],
      ['--good', '--good-soft'],
      ['--info', '--info-soft'],
    ]) {
      expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the bad/warn brand hues usable for icons and bars (3:1), and their -fg text AA', () => {
    for (const fg of ['--bad', '--warn']) {
      for (const bg of ['--background', '--card']) {
        expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
    for (const [fg, soft] of [
      ['--bad-fg', '--bad-soft'],
      ['--warn-fg', '--warn-soft'],
    ]) {
      for (const bg of ['--background', '--card', soft]) {
        expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps every chart series visible (3:1) on cards and apart from the status hues', () => {
    const series = CHART.map((n) => `--${n}`);
    for (const token of series) {
      expect(contrast(t[token], t['--card']), `${token} on --card`).toBeGreaterThanOrEqual(3);
      for (const status of ['--accent', '--good', '--bad', '--warn', '--info']) {
        expect(t[token].toLowerCase(), `${token} vs ${status}`).not.toBe(t[status].toLowerCase());
      }
    }
    expect(new Set(series.map((token) => t[token].toLowerCase())).size).toBe(series.length);
  });

  it('keeps text on the accent fill legible', () => {
    expect(contrast(t['--on-accent'], t['--accent'])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps borders distinguishable from their surface', () => {
    expect(contrast(t['--line-strong'], t['--card'])).toBeGreaterThan(1.1);
    expect(contrast(t['--line'], t['--background'])).toBeGreaterThan(1.03);
  });
});

describe('theme-color', () => {
  it('matches each theme canvas', () => {
    expect(THEME_COLORS.light).toBe(light['--background']);
    expect(THEME_COLORS.dark).toBe(dark['--background']);
  });

  it('keeps the web manifest on the Light canvas', () => {
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../public/manifest.webmanifest', import.meta.url)),
        'utf8',
      ),
    );
    expect(manifest.theme_color.toLowerCase()).toBe(THEME_COLORS.light);
    expect(manifest.background_color.toLowerCase()).toBe(THEME_COLORS.light);
  });

  it('uses a dark-text status bar on Light and a translucent one on Dark', () => {
    expect(STATUS_BAR_STYLES).toEqual({ light: 'default', dark: 'black-translucent' });
  });
});

describe('Light palette is the existing PumpOS look (DESIGN.md "Colors")', () => {
  const design = readFileSync(
    fileURLToPath(new URL('../../../../DESIGN.md', import.meta.url)),
    'utf8',
  );
  const colors = /^colors:\n((?: {2}.+\n)+)/m.exec(design)![1];
  const documented = (key: string): string => {
    const m = new RegExp(`^ {2}${key}: '(#[0-9A-Fa-f]{6})'`, 'm').exec(colors);
    if (!m) throw new Error(`DESIGN.md colors.${key} not found`);
    return m[1].toLowerCase();
  };

  // semantic token -> DESIGN.md colour key
  const MAP: Record<string, string> = {
    '--background': 'neutral',
    '--card': 'surface',
    '--card-alt': 'surface-alt',
    '--line': 'border-soft',
    '--line-strong': 'border-strong',
    '--text-high': 'on-surface',
    '--text-default': 'text-default',
    '--text-muted': 'text-muted',
    '--text-faint': 'text-faint',
    '--accent': 'primary',
    '--on-accent': 'on-primary',
    '--info': 'secondary',
    '--bad': 'error',
    '--warn': 'tertiary',
    '--good': 'success-fg',
    '--good-soft': 'success-bg',
    '--warn-soft': 'warning-bg',
    '--warn-fg': 'warning-fg',
    '--bad-soft': 'danger-bg',
    '--bad-fg': 'danger-fg',
    '--info-soft': 'info-bg',
  };

  it.each(Object.entries(MAP))('%s is DESIGN.md colors.%s', (token, key) => {
    expect(light[token].toLowerCase()).toBe(documented(key));
  });
});

describe('Tailwind bridge', () => {
  it('exposes every semantic token as a utility colour', () => {
    for (const token of REQUIRED.filter((t) => t !== '--hero' && t !== '--dock')) {
      const key = token.slice(2);
      expect(bridge, key).toContain(`var(--${key})`);
    }
  });
});

describe('amount / quantity style', () => {
  it('is Geist Mono with tabular figures, shared via .num', () => {
    const num = /\.num,\s*\.font-mono\s*\{([^}]*)\}/.exec(css)![1];
    expect(num).toContain('var(--font-mono)');
    expect(num).toContain('tabular-nums');
    expect(num).toContain("'tnum'");
  });
});
