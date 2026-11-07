/**
 * Text floor: mobile follows the design system's 12px minimum, like the
 * console (`packages/ui/src/pump-ds/classGuard.test.ts`, `small-text`).
 *
 * Fails on text below 12px anywhere in `apps/mobile/src`: `text-[11px]`,
 * `text-[0.65rem]`, `text-2xs`, a style `fontSize` under 12, and in CSS a
 * `font-size` or Tailwind `--text-*` size token under 12px. Use `text-xs`
 * (12px) for the smallest text.
 *
 * Type scale (#707): an arbitrary `text-[Npx]` must also be a DESIGN.md
 * typography `fontSize` (read from its front matter by the same
 * `readTypeScale` the console's `off-scale-text` guard uses), so a size like
 * 13.5px or 22px fails. Prefer the scale classes (`text-xs` 12, `text-sm` 14,
 * `text-lg` 18, `text-xl` 20).
 *
 * Exception: non-essential decoration where 12px cannot fit (a badge count in
 * a 16px dot). Mark it with `min-text exception: <reason>` in a comment on the
 * same line or the line above.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { readTypeScale } from '@pump/ui/src/pump-ds/class-guard/scan.ts';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const MIN_TEXT_PX = 12;
const TYPE_SCALE_PX = readTypeScale(readFileSync(path.join(SRC, '../../../DESIGN.md'), 'utf8'));
const EXCEPTION = /min-text exception:\s*[^\s*/}]/;

const toPx = (n: string, unit: string) => Number(n) * (unit === 'rem' ? 16 : 1);

/**
 * Every text size on one line that breaks the rules, as written: anything under
 * 12px, and an arbitrary `text-[Npx]` that is not a DESIGN.md type-scale size.
 */
function textSizeViolationsOn(
  line: string,
  kind: 'source' | 'css',
  scale: ReadonlySet<number> = TYPE_SCALE_PX,
): string[] {
  const out: string[] = [];
  if (kind === 'source') {
    for (const m of line.matchAll(/(?<![\w-])text-\[(\d*\.?\d+)(px|rem)\]/g))
      if (toPx(m[1]!, m[2]!) < MIN_TEXT_PX || !scale.has(toPx(m[1]!, m[2]!))) out.push(m[0]);
    for (const m of line.matchAll(/(?<![\w-])text-2xs(?![\w-])/g)) out.push(m[0]);
    for (const m of line.matchAll(
      /fontSize\s*:\s*(?:(\d*\.?\d+)(?![\w.])|['"`](\d*\.?\d+)(px|rem)['"`])/g,
    )) {
      const px = m[1] !== undefined ? Number(m[1]) : toPx(m[2]!, m[3]!);
      if (px < MIN_TEXT_PX) out.push(m[0]);
    }
  } else {
    for (const m of line.matchAll(/(?<![\w-])font-size\s*:\s*(\d*\.?\d+)(px|rem)/g))
      if (toPx(m[1]!, m[2]!) < MIN_TEXT_PX) out.push(m[0]);
    for (const m of line.matchAll(/(--text-[\w-]+)\s*:\s*(\d*\.?\d+)(px|rem)/g))
      if (
        !/--(line-height|letter-spacing|font-weight)$/.test(m[1]!) &&
        toPx(m[2]!, m[3]!) < MIN_TEXT_PX
      )
        out.push(m[0]);
  }
  return out;
}

/** Violations in one file's text, skipping lines marked (or preceded) by an exception comment. */
function scanText(
  text: string,
  kind: 'source' | 'css',
  scale: ReadonlySet<number> = TYPE_SCALE_PX,
): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (EXCEPTION.test(line) || (i > 0 && EXCEPTION.test(lines[i - 1]!))) return;
    for (const hit of textSizeViolationsOn(line, kind, scale)) out.push(`${i + 1}: ${hit}`);
  });
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = path.join(dir, name);
    return statSync(abs).isDirectory() ? walk(abs) : [abs];
  });
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f);

describe('mobile text floor (12px) and type scale', () => {
  it('no text below 12px or off the type scale in apps/mobile/src, outside marked exceptions', () => {
    const problems: string[] = [];
    for (const abs of walk(SRC)) {
      const rel = path.relative(SRC, abs).split(path.sep).join('/');
      const kind =
        /\.tsx?$/.test(rel) && !isTest(rel) ? 'source' : rel.endsWith('.css') ? 'css' : null;
      if (!kind) continue;
      for (const hit of scanText(readFileSync(abs, 'utf8'), kind)) problems.push(`${rel}:${hit}`);
    }
    expect(
      problems,
      'use a DESIGN.md type-scale size (text-xs/sm/lg/xl), or mark a `min-text exception: <reason>`',
    ).toEqual([]);
  });
});

describe('mobile text floor rules', () => {
  it('flags arbitrary sizes under 12px, text-2xs and small fontSize; keeps 12px and up', () => {
    const src = [
      '<p className="text-[11px] text-[10.5px] text-[0.65rem] text-2xs" />',
      '<p className="text-[12px] text-xs text-[13px] text-[0.75rem] text-sm" />',
      'const s = { fontSize: 11, b: { fontSize: "10px" }, c: { fontSize: 12 } };',
    ].join('\n');
    expect(scanText(src, 'source')).toEqual([
      '1: text-[11px]',
      '1: text-[10.5px]',
      '1: text-[0.65rem]',
      '1: text-2xs',
      '3: fontSize: 11',
      '3: fontSize: "10px"',
    ]);
  });

  it('flags CSS font-size and --text-* tokens under 12px, not their companions', () => {
    const css = [
      '.a { font-size: 11px; }',
      '.b { font-size: 0.75rem; }',
      ':root { --text-2xs: 0.625rem; --text-2xs--line-height: 0.5rem; --text-sm: 14px; }',
    ].join('\n');
    expect(scanText(css, 'css')).toEqual(['1: font-size: 11px', '3: --text-2xs: 0.625rem']);
  });

  it('skips a size marked with an exception comment on its line or the line above', () => {
    const src = [
      '/* min-text exception: badge count in a 16px dot */',
      '<span className="text-[9px]" />',
      '<span className="text-[9px]" /> {/* min-text exception: chart tick */}',
      '/* min-text exception: */',
      '<span className="text-[10px]" />',
      '<span className="text-[11px]" />',
    ].join('\n');
    expect(scanText(src, 'source')).toEqual(['5: text-[10px]', '6: text-[11px]']);
  });
});

describe('mobile type scale', () => {
  const scale = new Set([12, 13, 14]);

  it('flags arbitrary sizes off the scale, keeps on-scale and rem sizes', () => {
    const src =
      '<p className="text-[13.5px] text-[22px] text-[13px] text-[0.875rem] text-[0.8rem]" />';
    expect(scanText(src, 'source', scale)).toEqual([
      '1: text-[13.5px]',
      '1: text-[22px]',
      '1: text-[0.8rem]',
    ]);
  });

  it('honours the exception comment for an off-scale size', () => {
    const src = [
      '/* min-text exception: matches the PDF export */',
      '<p className="text-[22px]" />',
      '<p className="text-[30px]" />',
    ].join('\n');
    expect(scanText(src, 'source', scale)).toEqual(['3: text-[30px]']);
  });

  it('reads the real DESIGN.md scale', () => {
    expect([...TYPE_SCALE_PX].sort((a, b) => a - b)).toEqual([10, 12, 13, 14, 15, 18, 20, 24]);
  });

  it('takes the scale from front matter only, ignoring body examples', () => {
    const md = '---\ntypography:\n  a:\n    fontSize: 14px\n---\n\n    fontSize: 99px\n';
    expect([...readTypeScale(md)]).toEqual([14]);
  });

  it('fails on an empty scale rather than letting every size through', () => {
    expect(() => readTypeScale('---\ntypography:\n---\n')).toThrow(/no typography fontSize/);
    expect(() => readTypeScale('# no front matter')).toThrow(/no typography fontSize/);
  });
});
