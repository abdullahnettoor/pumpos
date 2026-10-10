import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from './theme.js';

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
  'good-soft',
  'good-line',
  'bad-soft',
  'bad-line',
  'warn-soft',
  'warn-line',
  'hero',
  'dock',
  'track',
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

  it('keeps accent and status colours legible on canvas, cards and their soft surfaces', () => {
    for (const fg of ['--accent', '--good', '--bad', '--warn', '--info']) {
      for (const bg of ['--background', '--card']) {
        expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    const soft: Array<[string, string]> = [
      ['--accent', '--accent-soft'],
      ['--good', '--good-soft'],
      ['--bad', '--bad-soft'],
      ['--warn', '--warn-soft'],
      ['--info', '--info-soft'],
    ];
    for (const [fg, bg] of soft) {
      expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
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
