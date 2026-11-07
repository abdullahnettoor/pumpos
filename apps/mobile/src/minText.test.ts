/**
 * Text floor: mobile follows the design system's 12px minimum, like the
 * console (`packages/ui/src/pump-ds/classGuard.test.ts`, `small-text`).
 *
 * Fails on text below 12px anywhere in `apps/mobile/src`: `text-[11px]`,
 * `text-[0.65rem]`, `text-2xs`, a style `fontSize` under 12, and in CSS a
 * `font-size` or Tailwind `--text-*` size token under 12px. Use `text-xs`
 * (12px) for the smallest text.
 *
 * Exception: non-essential decoration where 12px cannot fit (a badge count in
 * a 16px dot). Mark it with `min-text exception: <reason>` in a comment on the
 * same line or the line above.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const MIN_TEXT_PX = 12;
const EXCEPTION = /min-text exception:\s*[^\s*/}]/;

const toPx = (n: string, unit: string) => Number(n) * (unit === 'rem' ? 16 : 1);

/** Every sub-12px text size on one line, as written. */
function smallTextOn(line: string, kind: 'source' | 'css'): string[] {
  const out: string[] = [];
  if (kind === 'source') {
    for (const m of line.matchAll(/(?<![\w-])text-\[(\d*\.?\d+)(px|rem)\]/g))
      if (toPx(m[1]!, m[2]!) < MIN_TEXT_PX) out.push(m[0]);
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
function scanText(text: string, kind: 'source' | 'css'): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (EXCEPTION.test(line) || (i > 0 && EXCEPTION.test(lines[i - 1]!))) return;
    for (const hit of smallTextOn(line, kind)) out.push(`${i + 1}: ${hit}`);
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

describe('mobile text floor (12px)', () => {
  it('no text below 12px in apps/mobile/src, outside marked exceptions', () => {
    const problems: string[] = [];
    for (const abs of walk(SRC)) {
      const rel = path.relative(SRC, abs).split(path.sep).join('/');
      const kind =
        /\.tsx?$/.test(rel) && !isTest(rel) ? 'source' : rel.endsWith('.css') ? 'css' : null;
      if (!kind) continue;
      for (const hit of scanText(readFileSync(abs, 'utf8'), kind)) problems.push(`${rel}:${hit}`);
    }
    expect(problems, 'use text-xs (12px), or mark a `min-text exception: <reason>`').toEqual([]);
  });
});

describe('mobile text floor rules', () => {
  it('flags arbitrary sizes under 12px, text-2xs and small fontSize; keeps 12px and up', () => {
    const src = [
      '<p className="text-[11px] text-[10.5px] text-[0.65rem] text-2xs" />',
      '<p className="text-[12px] text-xs text-[13px] text-[0.75rem]" />',
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
