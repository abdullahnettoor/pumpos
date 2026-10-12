import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

/** Custom properties declared in the rule whose selector list matches `selector`. */
function declarations(selector: RegExp): Record<string, string> {
  const rule = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!rule) throw new Error(`rule not found: ${selector}`);
  const out: Record<string, string> = {};
  for (const m of rule[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const _light = declarations(/:root(?:\s*,\s*:root\.light)?/);
const dark = declarations(/:root\.dark/);

const REQUIRED_TOKENS = [
  '--bg-canvas',
  '--bg-surface',
  '--bg-surface-alt',
  '--border-soft',
  '--border-strong',
  '--text-strong',
  '--text-default',
  '--text-muted',
  '--text-faint',
  '--brand-primary',
  '--text-on-brand',
  '--brand-secondary',
  '--brand-warning',
  '--brand-danger',
  '--state-success-bg',
  '--state-success-fg',
  '--state-warning-bg',
  '--state-warning-fg',
  '--state-danger-bg',
  '--state-danger-fg',
  '--state-info-bg',
  '--state-info-fg',
] as const;

describe('dark tokens in index.css (#501)', () => {
  it('declares all required core tokens in :root.dark', () => {
    for (const token of REQUIRED_TOKENS) {
      expect(dark[token], `dark token ${token}`).toBeDefined();
    }
  });

  it('matches prototype dark values for surface, canvas, border, and text tokens', () => {
    expect(dark['--bg-canvas']).toBe('#0b0f0d');
    expect(dark['--bg-surface']).toBe('#121815');
    expect(dark['--bg-surface-alt']).toBe('#161d1a');
    expect(dark['--border-soft']).toBe('#1f2925');
    expect(dark['--border-strong']).toBe('#2a3530');
    expect(dark['--text-strong']).toBe('#ffffff');
    expect(dark['--text-default']).toBe('#cfd8d2');
    expect(dark['--text-muted']).toBe('#8a9a91');
    expect(dark['--text-faint']).toBe('#5d6c64');
  });

  it('matches prototype dark brand and status pairs', () => {
    expect(dark['--brand-primary']).toBe('#2fd18d');
    expect(dark['--text-on-brand']).toBe('#06110c');
    expect(dark['--brand-secondary']).toBe('#6cb6ff');
    expect(dark['--brand-warning']).toBe('#f2b544');
    expect(dark['--brand-danger']).toBe('#ff7a6b');

    expect(dark['--state-success-bg']).toBe('#10241b');
    expect(dark['--state-success-fg']).toBe('#2fd18d');
    expect(dark['--state-warning-bg']).toBe('#221a10');
    expect(dark['--state-warning-fg']).toBe('#f2b544');
    expect(dark['--state-danger-bg']).toBe('#241514');
    expect(dark['--state-danger-fg']).toBe('#ff7a6b');
    expect(dark['--state-info-bg']).toBe('#12263a');
    expect(dark['--state-info-fg']).toBe('#6cb6ff');
  });
});

function luminance(hex: string): number {
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrast(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('dark tokens contrast ratios', () => {
  it('guarantees legible text contrast against canvas and surface', () => {
    // Strong text on canvas and surface (WCAG AAA >= 7:1)
    expect(contrast(dark['--text-strong'], dark['--bg-canvas'])).toBeGreaterThan(15);
    expect(contrast(dark['--text-strong'], dark['--bg-surface'])).toBeGreaterThan(13);

    // Default text on canvas and surface (WCAG AA >= 4.5:1)
    expect(contrast(dark['--text-default'], dark['--bg-canvas'])).toBeGreaterThan(10);
    expect(contrast(dark['--text-default'], dark['--bg-surface'])).toBeGreaterThan(9);

    // Muted text on canvas and surface
    expect(contrast(dark['--text-muted'], dark['--bg-canvas'])).toBeGreaterThan(5);
    expect(contrast(dark['--text-muted'], dark['--bg-surface'])).toBeGreaterThan(4.5);
  });

  it('guarantees text-on-brand contrast on mint brand primary', () => {
    // Mint brand (#2fd18d) with text-on-brand (#06110c) is high contrast (>= 10:1)
    expect(contrast(dark['--text-on-brand'], dark['--brand-primary'])).toBeGreaterThan(9);
  });

  it('guarantees status fg on status bg contrast', () => {
    expect(contrast(dark['--state-success-fg'], dark['--state-success-bg'])).toBeGreaterThan(4.5);
    expect(contrast(dark['--state-warning-fg'], dark['--state-warning-bg'])).toBeGreaterThan(4.5);
    expect(contrast(dark['--state-danger-fg'], dark['--state-danger-bg'])).toBeGreaterThan(4.5);
    expect(contrast(dark['--state-info-fg'], dark['--state-info-bg'])).toBeGreaterThan(4.5);
  });
});
