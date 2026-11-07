/**
 * Mono weight (#711): only Geist Mono 400/500 ship, so a mono figure at 600+
 * gets a faked bold. Mirrors the console's `mono-weight` rule
 * (`packages/ui/src/pump-ds/classGuard.test.ts`) by reusing its scanner, with
 * mobile's `num` class counted as mono. Use `font-medium` (500) for figures;
 * sans labels may stay bold.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { scanCssMonoWeight, scanSource } from '@pump/ui/src/pump-ds/class-guard/scan.ts';
import { sourceFiles } from './test/sourceFiles.ts';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const ctx = { generates: () => true, monoClasses: ['font-mono', 'num'] };
const mono = (src: string) => scanSource(src, 'x.tsx', ctx)['mono-weight'];

describe('mobile mono weight', () => {
  it('no mono figure at 600+ in apps/mobile/src', () => {
    const problems: string[] = [];
    for (const { rel, kind, text } of sourceFiles(SRC))
      for (const h of kind === 'css' ? scanCssMonoWeight(text()) : mono(text()))
        problems.push(`${rel}: ${h}`);
    expect(problems, 'use font-medium (500) on mono figures').toEqual([]);
  });

  it('flags num and font-mono with a heavy weight, also across cn() args', () => {
    expect(mono('<b className="num text-sm font-semibold" />')).toEqual(['num + font-semibold']);
    expect(mono('<b className="font-mono font-bold" />')).toEqual(['font-mono + font-bold']);
    expect(mono(`cn('num', ok && 'font-bold')`)).toEqual(['num + font-bold']);
  });

  it('passes weight 500 and sans bold', () => {
    expect(mono('<b className="num font-medium" />')).toEqual([]);
    expect(mono('<b className="font-semibold" />')).toEqual([]);
  });

  it('flags CSS mono rules at 600+ and inline styles', () => {
    expect(scanCssMonoWeight('.a { font-family: var(--font-mono); font-weight: 700; }')).toEqual([
      '.a: font-weight 700',
    ]);
    expect(scanCssMonoWeight('.a { font-family: var(--font-mono); font-weight: 500; }')).toEqual(
      [],
    );
    expect(mono(`const s = { fontFamily: 'var(--font-mono)', fontWeight: 700 };`)).toEqual([
      'style: fontFamily mono + fontWeight 700',
    ]);
    expect(mono(`const s = { fontFamily: 'var(--font-mono)', fontWeight: 500 };`)).toEqual([]);
  });
});
