/**
 * Style check (#512, #517): every class and colour in `packages/ui/src` must
 * come from the design system.
 *
 * Per file it counts:
 * - `dead-class`     Tailwind tokens that generate no CSS against
 *                    `pump-ds/tailwind.css` (`bg-line`, `text-accent`). Tailwind
 *                    v4 skips unknown utilities silently and there is no
 *                    Preflight, so a dead class shows up only as a missing fill.
 * - `undefined-var`  `var(--x)` where `--x` is defined nowhere.
 * - `raw-color`      hex / `rgb(a)` / `hsl(a)` in any string: classes, style
 *                    values, constants, ternaries, SVG attributes, and
 *                    fallbacks like `var(--text-on-brand, #fff)`.
 * - `palette-class`  Tailwind's default palette (`text-gray-500`, `text-white`).
 * - `off-scale-text` an arbitrary `text-[Npx]` size not on the DESIGN.md type
 *                    scale (the `fontSize` values in DESIGN.md's frontmatter), e.g. `text-[12.5px]` (#700).
 * - `untokenized-depth` default radii, pixel radii and default shadows (#699).
 * - `inline-style`   JSX style object literals (#697), including computed values.
 *                    Counts ratchet remaining inline styles; static looks belong in classes.
 * - `fill-text-pair` a solid tone fill with a `text-on-*` that is not its pair
 *                    (`bg-danger-fg text-on-brand`, `hover:` states too),
 *                    also when split across ternary branches or `cn()` args.
 * - `small-text`     text below the 12px floor (#515, #602): `text-[11px]`,
 *                    `text-[0.6rem]`, `text-2xs`, a style `fontSize` under 12,
 *                    and in CSS a `font-size` or Tailwind `--text-*` token
 *                    under 12px. Only react-pdf typography is skipped (a
 *                    `StyleSheet.create` argument or the `style` prop of a
 *                    react-pdf element: print points, not screen px).
 *
 * - `mono-weight`   `font-mono` with `font-semibold`/`font-bold` on one element, or
 *                    an inline style or CSS rule with the mono family and weight 600+ (#701): only
 *                    Geist Mono 400/500 ship, so the browser fakes the bold.
 *
 * Class strings are `className` / `cn()` values, plus any other string whose
 * tokens are all class-shaped with at least one utility prefix (class maps).
 *
 * Today's violations are in `class-guard/allowlist.json` (rule → file →
 * count). The test fails when a file gains violations, when a file not on the
 * list has any, and when a file has FEWER than its entry: lower the entry with
 * `npm run test:classes:update -w @pump/ui`, which only ever lowers entries.
 * `npm run test:classes:baseline -w @pump/ui` rewrites the list from scratch
 * (may raise entries): one-off rebaselines only, never in a normal PR.
 *
 * Documented exceptions (the only entries the list may keep, #539):
 * - `inline-style` (#697): a per-file migration ceiling for existing objects,
 *   including runtime positions/sizes and PDF styles. Only decreases are allowed.
 * - `theme/config.ts` raw-color 2: `THEME_COLORS` is the canvas as literal hex
 *   because the pre-paint script sets `<meta name="theme-color">` before any
 *   CSS loads. `theme/tokens.test.ts` keeps it equal to `--bg-canvas`.
 * - `small-text` (#602), table headers only (10px uppercase, the one exception
 *   to the 12px floor): `pump-ds/table/columns.tsx` 1 (`HEADER`), which
 *   `components/primitives/DataTable.tsx` reuses.
 * - `small-text` `components/Shifts/OpenShiftForm.tsx` 1: temporary, swept once
 *   #619 (which rewrites that form) merges. Remove the entry then.
 *
 * Run: `npm run test:classes -w @pump/ui`
 * Plain CSS classes defined in `index.css` are allowed; add marker classes
 * with no CSS (like `group`) to MARKER_CLASSES in `class-guard/scan.ts`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vite-plus/test';
import {
  baselineAllowList,
  compareToAllowList,
  lowerAllowList,
  type Counts,
} from './class-guard/ratchet.js';
import {
  RULES,
  cssDefinitions,
  findFillTextMismatches,
  readTypeScale,
  scanCss,
  scanCssMonoWeight,
  scanCssSmallText,
  findMonoWeightMismatches,
  scanSource,
  sourceDefinitions,
  type Findings,
  type ScanResult,
} from './class-guard/scan.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW_LIST = path.join(SRC, 'pump-ds/class-guard/allowlist.json');
const UPDATE = process.env.CLASS_GUARD_UPDATE === '1';
/** One-off rebaseline: rewrite the list from the actual counts (may raise). */
const BASELINE = process.env.CLASS_GUARD_BASELINE === '1';
const require_ = createRequire(import.meta.url);

/** Folders that are not product UI: the guard itself and test helpers. */
const SKIP_DIRS = ['pump-ds/class-guard', 'test'];

function walk(rel: string): string[] {
  const abs = path.join(SRC, rel);
  if (statSync(abs).isFile()) return [rel];
  if (SKIP_DIRS.includes(rel.split(path.sep).join('/'))) return [];
  return readdirSync(abs).flatMap((name) => walk(path.join(rel, name)));
}

const toPosix = (p: string) => p.split(path.sep).join('/');
const isTest = (f: string) => /\.(test|dom\.test|stories)\.tsx?$/.test(f);
const ALL_FILES = walk('').map(toPosix);
const SOURCE_FILES = ALL_FILES.filter((f) => /\.tsx?$/.test(f) && !isTest(f));
const CSS_FILES = ALL_FILES.filter((f) => f.endsWith('.css'));
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

async function makeBuilder() {
  const cssPath = path.join(SRC, 'pump-ds/tailwind.css');
  const compiler = await compile(readFileSync(cssPath, 'utf8'), {
    base: path.dirname(cssPath),
    loadStylesheet: async (id, base) => {
      const file = id.startsWith('.') ? path.resolve(base, id) : require_.resolve(id);
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') };
    },
  });
  const cache = new Map<string, boolean>();
  return (token: string): boolean => {
    let hit = cache.get(token);
    if (hit === undefined) {
      // `build` is cumulative, so match the whole selector, not a prefix of
      // a longer class built earlier (`.border-border` vs `.border-border-soft`).
      hit = new RegExp(`\\.${regexEscape(cssEscape(token))}(?![\\w-])`).test(
        compiler.build([token]),
      );
      cache.set(token, hit);
    }
    return hit;
  };
}

const regexEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Minimal CSS.escape (node has none): enough for Tailwind candidates.
const cssEscape = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

function plainCssClasses(): Set<string> {
  return new Set([...read('index.css').matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!));
}

function definedVars(): Set<string> {
  return new Set([
    ...CSS_FILES.flatMap((f) => cssDefinitions(read(f))),
    ...SOURCE_FILES.flatMap((f) => sourceDefinitions(read(f))),
  ]);
}

/** Every violation in the tree, keyed by file. */
async function scanTree(): Promise<Map<string, Findings>> {
  const ctx = {
    generates: await makeBuilder(),
    plainClasses: plainCssClasses(),
    definedVars: definedVars(),
  };
  const out = new Map<string, Findings>();
  for (const file of SOURCE_FILES) out.set(file, scanSource(read(file), file, ctx));
  for (const file of CSS_FILES) {
    const undef = scanCss(read(file), ctx.definedVars);
    const small = scanCssSmallText(read(file));
    const mono = scanCssMonoWeight(read(file));
    if (undef.length || small.length || mono.length)
      out.set(file, {
        ...emptyFindings(),
        'undefined-var': undef,
        'small-text': small,
        'mono-weight': mono,
      });
  }
  return out;
}

const emptyFindings = (): Findings =>
  Object.fromEntries(RULES.map((r) => [r, []])) as unknown as Findings;

function countsOf(tree: Map<string, Findings>): Counts {
  const counts: Counts = {};
  for (const [file, findings] of tree)
    for (const rule of RULES)
      if (findings[rule].length) (counts[rule] ??= {})[file] = findings[rule].length;
  return counts;
}

const readAllowList = (): Counts => JSON.parse(readFileSync(ALLOW_LIST, 'utf8')) as Counts;

describe('style check: packages/ui/src stays within the design system', () => {
  it('no file has more violations than its allow-list entry, and no entry is stale', async () => {
    const tree = await scanTree();
    const actual = countsOf(tree);
    let allowed = readAllowList();
    if (BASELINE || UPDATE) {
      allowed = BASELINE ? baselineAllowList(actual, allowed) : lowerAllowList(actual, allowed);
      writeFileSync(ALLOW_LIST, `${JSON.stringify(allowed, null, 2)}\n`);
    }
    const problems = compareToAllowList(actual, allowed).map((p) =>
      p.actual > p.allowed
        ? `${p.file} [${p.rule}] ${p.actual} > allowed ${p.allowed}: fix the new violation (${tree.get(p.file)![p.rule].join(', ')})`
        : `${p.file} [${p.rule}] ${p.actual} < allowed ${p.allowed}: lower the entry with \`npm run test:classes:update -w @pump/ui\``,
    );
    expect(problems, 'style-check ratchet (class-guard/allowlist.json)').toEqual([]);
  }, 60000);
});

/** A compiler that knows only `ok`. */
const fake = (ok: string[]) => ({ generates: (t: string) => ok.includes(t) });

describe('style check rules', () => {
  it('inline-style: counts every JSX object, including computed positions, but not comments or forwarded props', () => {
    const fixture =
      "// style={{ color: 'red' }}\n<i style={{ top: pos.top }} />; <b style = { { width: size } } />; <u style={style} />;";
    expect(scanSource(fixture, 'x.tsx', { generates: () => true })['inline-style']).toEqual([
      '{ top: pos.top }',
      '{ width: size }',
    ]);
  });

  it('untokenized-depth: rejects default and pixel radii and default shadows, including variants and maps', () => {
    const fixture =
      "<i className='rounded-sm rounded-md hover:rounded-lg rounded-xl rounded-[6px] rounded-[7.5px] shadow-sm md:shadow-md shadow-lg' />; const T = 'rounded-[8px]';";
    expect(scanSource(fixture, 'x.tsx', { generates: () => true })['untokenized-depth']).toEqual([
      'rounded-sm',
      'rounded-md',
      'hover:rounded-lg',
      'rounded-xl',
      'rounded-[6px]',
      'rounded-[7.5px]',
      'shadow-sm',
      'md:shadow-md',
      'shadow-lg',
      'rounded-[8px]',
    ]);
  });

  it('untokenized-depth: radius and layer tokens compile and pass', async () => {
    const generates = await makeBuilder();
    const tokens = [
      'rounded-button',
      'rounded-input',
      'rounded-card',
      'rounded-drawer',
      'rounded-chip',
      'rounded-tooltip',
      'shadow-(--shadow-popover)',
      'shadow-(--shadow-dialog)',
      'shadow-(--shadow-tooltip)',
      'shadow-(--shadow-drawer)',
      'shadow-(--shadow-control)',
    ];
    for (const token of tokens) expect(generates(token), token).toBe(true);
    expect(
      scanSource(`<i className='${tokens.join(' ')}' />`, 'x.tsx', { generates })[
        'untokenized-depth'
      ],
    ).toEqual([]);
  });

  it('dead-class: a class that compiles to nothing, in className and in .ts class maps', async () => {
    const generates = await makeBuilder();
    const fixture =
      "const M = { a: 'bg-line' };\nconst x = <i className={`p-2 ${M.a} text-accent`} />;";
    expect(scanSource(fixture, 'x.tsx', { generates })['dead-class'].sort()).toEqual([
      'bg-line',
      'text-accent',
    ]);
  });

  it('dead-class: counts every occurrence, ignores index.css classes and ${…} fragments', () => {
    const fixture =
      "<i className='bg-line card' />; <b className='bg-line' />; <u className={`bg-${t}-fg`} />";
    const ctx = { ...fake([]), plainClasses: new Set(['card']) };
    expect(scanSource(fixture, 'x.tsx', ctx)['dead-class']).toEqual(['bg-line', 'bg-line']);
  });

  it('palette-class: default Tailwind palette and white/black, with variants', () => {
    const fixture =
      "<i className='text-gray-500 hover:bg-blue-600 text-white bg-brand' />; const T = 'border-t-slate-200';";
    expect(scanSource(fixture, 'x.tsx', fake(['bg-brand']))['palette-class']).toEqual([
      'text-gray-500',
      'hover:bg-blue-600',
      'text-white',
      'border-t-slate-200',
    ]);
  });

  it('raw-color: hex / rgb in classes, style props and style objects, incl. var fallbacks', () => {
    const fixture = [
      "<i className='bg-[#fff] p-2' />;",
      "<b style={{ color: 'var(--text-on-brand, #fff)', background: 'rgba(0,0,0,.1)' }} />;",
      "const td: CSSProperties = { borderColor: '#e5e7eb', width: 2 };",
      "const label = 'Order #123';",
    ].join('\n');
    expect(scanSource(fixture, 'x.tsx', fake(['bg-[#fff]', 'p-2']))['raw-color'].sort()).toEqual([
      'bg-[#fff]',
      'style: #e5e7eb',
      'style: #fff',
      'style: rgba(',
    ]);
  });

  it('raw-color: CSS keywords are not classes; PDF documents (no CSS vars) may use hex', () => {
    const style = "const s = { boxSizing: 'border-box', color: '#111' };";
    expect(scanSource(style, 'x.tsx', fake([]))).toMatchObject({
      'dead-class': [],
      'raw-color': ['style: #111'],
    });
    const pdf = `import { Text } from '@react-pdf/renderer';\n${style}`;
    expect(scanSource(pdf, 'x.tsx', fake([]))['raw-color']).toEqual([]);
  });

  it('undefined-var: var(--x) with --x defined nowhere; --tw-* and defined vars pass', () => {
    const fixture =
      "<i style={{ color: 'var(--color-text-muted)', width: 'var(--tw-w)', background: 'var(--bg-surface)' }} />";
    const ctx = { ...fake([]), definedVars: new Set(['--bg-surface']) };
    expect(scanSource(fixture, 'x.tsx', ctx)['undefined-var']).toEqual(['--color-text-muted']);
    const frag = "<i className='bg-(--nope)' style={{ color: `var(--state-${t}-fg)` }} />";
    expect(scanSource(frag, 'x.tsx', ctx)['undefined-var']).toEqual(['--nope']);
    expect(scanCss('a { color: var(--nope); b: var(--ok) }', new Set(['--ok']))).toEqual([
      '--nope',
    ]);
  });

  it('fill-text-pair: text on a solid fill must be its pair, per hover/variant state', () => {
    expect(findFillTextMismatches('bg-danger-fg text-on-brand')).toEqual([
      'bg-danger-fg + text-on-brand',
    ]);
    expect(findFillTextMismatches('bg-brand text-on-danger')).toEqual([
      'bg-brand + text-on-danger',
    ]);
    expect(findFillTextMismatches('text-ink-muted hover:bg-danger-fg hover:text-on-brand')).toEqual(
      ['hover:bg-danger-fg + hover:text-on-brand'],
    );
    expect(findFillTextMismatches('bg-brand text-on-brand hover:bg-brand-danger')).toEqual([
      'hover:bg-brand-danger + hover:text-on-brand',
    ]);
    for (const ok of [
      'bg-brand text-on-brand',
      'bg-danger-fg text-on-danger',
      'bg-brand-danger text-on-danger',
      'bg-warning-fg text-on-warning',
      'bg-success-fg text-on-success',
      'bg-info-fg text-on-info',
      'bg-ink-strong text-on-neutral',
      'bg-brand text-on-brand hover:bg-danger-fg hover:text-on-danger',
      'bg-danger-bg text-on-brand',
    ])
      expect(findFillTextMismatches(ok), ok).toEqual([]);
  });

  it('text-on-* utilities compile against the real tailwind.css', async () => {
    const generates = await makeBuilder();
    for (const token of [
      'text-on-brand',
      'text-on-danger',
      'text-on-warning',
      'text-on-success',
      'text-on-info',
      'text-on-neutral',
    ])
      expect(generates(token), token).toBe(true);
  });

  it('fill-text-pair: correct pairs pass and a wrong one is flagged (real compiler)', async () => {
    const generates = await makeBuilder();
    const fixture = [
      "<i className='bg-danger-fg text-on-danger' />;",
      "<i className='bg-warning-fg text-on-warning' />;",
      "<i className='bg-success-fg text-on-success' />;",
      "<i className='bg-info-fg text-on-info' />;",
      "<i className='bg-ink-strong text-on-neutral' />;",
      "const B = 'bg-brand text-on-danger';",
    ].join('\n');
    const f = scanSource(fixture, 'x.tsx', { generates });
    expect(f['dead-class']).toEqual([]);
    expect(f['fill-text-pair']).toEqual(['bg-brand + text-on-danger']);
  });

  it('fill-text-pair: a pair split across strings (ternary in a template, cn() args, consts)', () => {
    const ok = fake([]);
    const pair = (src: string) => scanSource(src, 'x.tsx', ok)['fill-text-pair'];
    expect(pair("<i className={`${ok ? 'bg-brand' : 'bg-danger-fg'} text-on-brand`} />")).toEqual([
      'bg-danger-fg + text-on-brand',
    ]);
    expect(pair("const c = (ok) => `${ok ? 'bg-brand' : 'bg-danger-fg'} text-on-brand`;")).toEqual([
      'bg-danger-fg + text-on-brand',
    ]);
    expect(pair("<i className={cn('px-2 bg-danger-fg', ok && 'text-on-brand')} />")).toEqual([
      'bg-danger-fg + text-on-brand',
    ]);
    expect(pair("const base = 'bg-danger-fg';\nconst x = cn(base, 'text-on-brand');")).toEqual([
      'bg-danger-fg + text-on-brand',
    ]);
    expect(
      pair(
        "const T = { a: 'bg-brand', b: 'bg-danger-fg' };\n<i className={cn(T[tone], 'text-on-danger')} />",
      ),
    ).toEqual(['bg-brand + text-on-danger']);
    // Each branch carries its own pair: no mismatch across branches.
    expect(
      pair(
        "<i className={cn('p-2', ok ? 'bg-brand text-on-brand' : 'bg-danger-fg text-on-danger')} />",
      ),
    ).toEqual([]);
    // Counted once when one literal already holds the mismatch.
    expect(pair("<i className={cn('bg-danger-fg text-on-brand', 'p-2')} />")).toEqual([
      'bg-danger-fg + text-on-brand',
    ]);
  });
});

describe('style check: off-scale-text (#700)', () => {
  const off = (src: string) => scanSource(src, 'x.tsx', fake([]))['off-scale-text'];

  it('reads the scale only from the front-matter typography block', () => {
    const md = [
      '---',
      'name: x',
      'typography:',
      '  body:',
      '    fontSize: 14px',
      '  caption:',
      '    fontSize: 12px',
      'rounded:',
      '  card: 16px',
      '---',
      '',
      '```yaml',
      '  fontSize: 16px',
      '```',
    ].join('\n');
    expect([...readTypeScale(md)].sort()).toEqual([12, 14]);
    expect(() => readTypeScale('# no front matter\n  fontSize: 16px\n')).toThrow();
  });

  it('keeps mobile-only typography keys out of the desktop scale', () => {
    const md = [
      '---',
      'typography:',
      '  body:',
      '    fontSize: 14px',
      '  mobile-hero-figure:',
      '    fontSize: 30px',
      '  mobile-page-title:',
      '    fontSize: 22px',
      '---',
      '',
    ].join('\n');
    expect([...readTypeScale(md)]).toEqual([14]);
    expect([...readTypeScale(md, 'mobile')].sort()).toEqual([14, 22, 30]);
    expect(() =>
      readTypeScale('---\ntypography:\n  mobile-x:\n    fontSize: 30px\n---\n'),
    ).toThrow();
  });

  it('desktop rejects the mobile hero and page-title sizes in the real scale', () => {
    expect(off("<i className='text-[22px] text-[30px] text-[24px]' />")).toEqual([
      'text-[22px]',
      'text-[30px]',
    ]);
  });

  it('flags arbitrary sizes off the type scale, with variants', () => {
    expect(
      off(
        "<i className='text-[12.5px] hover:text-[17px] text-[13.5px] text-[19px] text-[16px] text-[28px] text-[0.8125rem]' />",
      ),
    ).toEqual([
      'text-[12.5px]',
      'hover:text-[17px]',
      'text-[13.5px]',
      'text-[19px]',
      'text-[16px]',
      'text-[28px]',
    ]);
  });

  it('passes scale sizes and non-size text utilities', () => {
    expect(
      off(
        "<i className='text-[12px] text-[13px] text-[14px] text-[15px] text-[18px] text-[20px] text-[24px] text-ink-muted text-sm' />",
      ),
    ).toEqual([]);
  });
});

describe('style check: small-text (#602)', () => {
  const small = (src: string, file = 'x.tsx') => scanSource(src, file, fake([]))['small-text'];

  it('flags arbitrary sizes under 12px, text-2xs, and variants', () => {
    expect(
      small(
        "<i className='text-[11px] text-[10.5px] hover:text-[9px] text-[0.6rem] text-2xs' />; const T = 'px-1 text-[11px]';",
      ),
    ).toEqual([
      'text-[11px]',
      'text-[10.5px]',
      'hover:text-[9px]',
      'text-[0.6rem]',
      'text-2xs',
      'text-[11px]',
    ]);
  });

  it('passes 12px and up, and non-size text utilities', () => {
    expect(
      small("<i className='text-[12px] text-[13px] text-[0.75rem] text-sm text-ink-muted' />"),
    ).toEqual([]);
  });

  it('flags fontSize under 12 in style objects', () => {
    const style =
      "<i style={{ fontSize: 11 }} />; const s = { fontSize: '10px' }; const t = { fontSize: '12px', a: 9 };";
    expect(small(style)).toEqual(['fontSize: 11', 'fontSize: 10px']);
  });

  it('skips react-pdf typography only, not the whole PDF-importing file', () => {
    const pdf = [
      "import { Text, StyleSheet } from '@react-pdf/renderer';",
      "import * as Pdf from '@react-pdf/renderer';",
      'const s = StyleSheet.create({ label: { fontSize: 7 } });',
      '<Text style={{ fontSize: 8.5 }}>a</Text>;',
      '<Pdf.Text style={{ fontSize: 9 }}>b</Pdf.Text>;',
      // Screen text in the same file still counts.
      '<span style={{ fontSize: 11 }}>c</span>;',
      "const loose = { fontSize: '10px' };",
      "<i className='text-[11px]' />;",
    ].join('\n');
    expect(small(pdf).sort()).toEqual(['fontSize: 10px', 'fontSize: 11', 'text-[11px]']);
  });

  it('CSS: font-size declarations and Tailwind --text-* tokens under 12px', () => {
    const css = [
      '.a { font-size: 11px; }',
      '.b { font-size: 0.65rem !important; }',
      '.c { font-size: 12px; font-size: clamp(10px, 2vw, 14px); }',
      '@theme { --text-2xs: 0.625rem; --text-2xs--line-height: 0.5rem; --text-xs: 12px; }',
      ':root { --text-muted: #5e6a61; }',
      '/* font-size: 9px */',
    ].join('\n');
    expect(scanCssSmallText(css)).toEqual([
      'font-size: 11px',
      'font-size: 0.65rem',
      '--text-2xs: 0.625rem',
    ]);
  });
});

describe('style check: strings outside className', () => {
  const none = { generates: () => false };

  it('dead-class: a class map of mostly-dead tokens is still a class string', () => {
    const map = "const TONE = { warn: 'bg-line text-accent' };\n<i className={TONE.warn} />;";
    expect(scanSource(map, 'x.tsx', none)['dead-class']).toEqual(['bg-line', 'text-accent']);
    const prop = '<Field labelClassName="text-accent border-subtle" />';
    expect(scanSource(prop, 'x.tsx', none)['dead-class']).toEqual(['text-accent', 'border-subtle']);
    const variant = "const R = 'hover:bg-line';";
    expect(scanSource(variant, 'x.tsx', none)['dead-class']).toEqual(['hover:bg-line']);
  });

  it('dead-class: copy, keys and CSS values are not class strings', () => {
    const fixture = [
      "const a = 'Shift closed: text-only summary';",
      "const b = 'Border colour for the text-field';",
      "const c = 'pumpos:pending-stock-count';",
      "const d = { transition: 'border-color 150ms ease', boxSizing: 'border-box' };",
      "const e = 'flex items-center gap-2';",
    ].join('\n');
    const f = scanSource(fixture, 'x.tsx', fake(['flex', 'items-center', 'gap-2']));
    expect(f['dead-class']).toEqual([]);
    expect(f['raw-color']).toEqual([]);
  });

  it('raw-color: hex / rgb / hsl in any string, incl. consts, ternaries and SVG attributes', () => {
    const fixture = [
      "const C = { a: '#fff' };",
      "const fg = ok ? '#123' : '#456';",
      'const s = `rgba(0, 0, 0, ${alpha})`;',
      "const h = 'hsl(10 20% 30%)';",
      '<path fill="#E5E7EB" stroke="url(#grad)" />;',
      "const copy = 'Order #123 for Acme';",
      "const anchor = '#settings';",
    ].join('\n');
    expect(scanSource(fixture, 'x.tsx', fake([]))['raw-color']).toEqual([
      'value: #fff',
      'value: #123',
      'value: #456',
      'value: rgba(',
      'value: hsl(',
      'value: #E5E7EB',
    ]);
  });
});

describe('style check ratchet', () => {
  it('baseline never raises or adds inline-style entries, but can lower them while rebaselining other rules', () => {
    const allowed: Counts = { 'inline-style': { 'popover.tsx': 1, 'removed.tsx': 2 } };
    const actual: Counts = {
      'inline-style': { 'popover.tsx': 2, 'new.tsx': 1, 'removed.tsx': 1 },
      'dead-class': { 'other.tsx': 3 },
    };
    expect(baselineAllowList(actual, allowed)).toEqual({
      'dead-class': { 'other.tsx': 3 },
      'inline-style': { 'popover.tsx': 1, 'removed.tsx': 1 },
    });
    expect(baselineAllowList(actual)).toEqual({ 'dead-class': { 'other.tsx': 3 } });
    expect(baselineAllowList({ 'inline-style': {} }, allowed)).toEqual({});
  });

  it('inline-style: rejects growth and new files, and its update can only lower the recorded count', () => {
    const ceiling: Counts = { 'inline-style': { 'popover.tsx': 1 } };
    const grown: Counts = { 'inline-style': { 'popover.tsx': 2, 'new.tsx': 1 } };
    expect(compareToAllowList(grown, ceiling)).toEqual([
      { rule: 'inline-style', file: 'new.tsx', allowed: 0, actual: 1 },
      { rule: 'inline-style', file: 'popover.tsx', allowed: 1, actual: 2 },
    ]);
    expect(lowerAllowList(grown, ceiling)).toEqual(ceiling);
    expect(lowerAllowList({ 'inline-style': { 'popover.tsx': 0 } }, ceiling)).toEqual({});
  });

  const allowed: Counts = { 'dead-class': { 'a.tsx': 2, 'b.tsx': 1 } };

  it('passes when every count equals its entry', () => {
    expect(compareToAllowList({ 'dead-class': { 'a.tsx': 2, 'b.tsx': 1 } }, allowed)).toEqual([]);
  });

  it('fails when a listed file gains, or an unlisted file has, a violation', () => {
    const actual: Counts = {
      'dead-class': { 'a.tsx': 3, 'b.tsx': 1 },
      'raw-color': { 'c.tsx': 1 },
    };
    expect(compareToAllowList(actual, allowed)).toEqual([
      { rule: 'dead-class', file: 'a.tsx', allowed: 2, actual: 3 },
      { rule: 'raw-color', file: 'c.tsx', allowed: 0, actual: 1 },
    ]);
  });

  it('fails when a file has fewer violations than its entry (the list must shrink)', () => {
    expect(compareToAllowList({ 'dead-class': { 'a.tsx': 1 } }, allowed)).toEqual([
      { rule: 'dead-class', file: 'a.tsx', allowed: 2, actual: 1 },
      { rule: 'dead-class', file: 'b.tsx', allowed: 1, actual: 0 },
    ]);
  });

  it('update only lowers entries: never raises one and never adds a file or rule', () => {
    const actual: Counts = {
      'dead-class': { 'a.tsx': 5, 'b.tsx': 0, 'new.tsx': 4 },
      'raw-color': { 'c.tsx': 1 },
    };
    expect(lowerAllowList(actual, allowed)).toEqual({ 'dead-class': { 'a.tsx': 2 } });
    expect(lowerAllowList({ 'dead-class': { 'a.tsx': 1, 'b.tsx': 1 } }, allowed)).toEqual({
      'dead-class': { 'a.tsx': 1, 'b.tsx': 1 },
    });
  });

  it('baseline rewrites from actual counts (raises and adds); update never raises', () => {
    const actual: Counts = {
      'dead-class': { 'a.tsx': 5, 'b.tsx': 0, 'new.tsx': 4 },
      'raw-color': { 'c.tsx': 1 },
    };
    const fresh: Counts = {
      'dead-class': { 'a.tsx': 5, 'new.tsx': 4 },
      'raw-color': { 'c.tsx': 1 },
    };
    expect(baselineAllowList(actual)).toEqual(fresh);
    expect(compareToAllowList(actual, baselineAllowList(actual))).toEqual([]);
    const lowered = lowerAllowList(actual, allowed);
    for (const [rule, byFile] of Object.entries(lowered))
      for (const [file, n] of Object.entries(byFile))
        expect(n).toBeLessThanOrEqual(allowed[rule as keyof Counts]![file]!);
    expect(lowered).not.toEqual(fresh);
  });

  it('the committed allow-list is already lowered (sorted, no zero entries)', () => {
    const list = readAllowList();
    expect(lowerAllowList(list, list)).toEqual(list);
    expect(JSON.stringify(lowerAllowList(list, list))).toEqual(JSON.stringify(list));
  });
});

// Older #512 pitfalls, still required at zero in the dashboard / pump-ds /
// theme / shell scope. `scanSource` reports them; they are not ratcheted.
const LEGACY_SCOPES = [
  'components/Dashboard/',
  'pump-ds/',
  'theme/',
  'components/AppShell.tsx',
  'components/AppTopBar.tsx',
];
const legacyScopeFiles = () =>
  SOURCE_FILES.filter((f) => LEGACY_SCOPES.some((s) => f === s || f.startsWith(s)));
const pitfalls = (src: string, file = 'x.tsx'): ScanResult =>
  scanSource(src, file, { generates: () => true });

describe('class guard: border and interpolation pitfalls (dashboard / pump-ds / theme / shell)', () => {
  it('no side-only dashed borders (border-dashed styles every side)', () => {
    const bad = legacyScopeFiles().flatMap((file) =>
      pitfalls(read(file), file)['side-only-dash'].map((lit) => `${file}: ${lit}`),
    );
    expect(bad).toEqual([]);
    expect(pitfalls("const R = 'border-t border-dashed px-3';")['side-only-dash']).toHaveLength(1);
    expect(
      pitfalls('<i className={`border-b ${x} hover:border-dotted`} />')['side-only-dash'],
    ).toHaveLength(1);
    expect(pitfalls("const R = 'border border-dashed';")['side-only-dash']).toHaveLength(0);
  });

  it('no ${…} inside a quoted className (it renders literally)', () => {
    const bad = legacyScopeFiles().flatMap((file) =>
      pitfalls(read(file), file)['quoted-interpolation'].map((lit) => `${file}: ${lit}`),
    );
    expect(bad).toEqual([]);
    expect(pitfalls('<i className="size-2 ${SW[i]}" />')['quoted-interpolation']).toHaveLength(1);
    expect(pitfalls('<i className={`size-2 ${SW[i]}`} />')['quoted-interpolation']).toHaveLength(0);
  });
});

describe('style check: mono-weight (#701)', () => {
  const mono = (src: string) => scanSource(src, 'x.tsx', fake([]))['mono-weight'];

  it('counts extra mono classes passed in the scan context (mobile `num`)', () => {
    const ctx = { ...fake([]), monoClasses: ['font-mono', 'num'] };
    expect(scanSource("<i className='num font-bold' />", 'x.tsx', ctx)['mono-weight']).toEqual([
      'num + font-bold',
    ]);
    expect(mono("<i className='num font-bold' />")).toEqual([]);
  });

  it('flags font-mono with font-semibold/font-bold, also split across cn() args', () => {
    expect(mono("<i className='font-mono text-sm font-semibold' />")).toEqual([
      'font-mono + font-semibold',
    ]);
    expect(mono("<i className={cn('font-mono', ok && 'font-bold')} />")).toEqual([
      'font-mono + font-bold',
    ]);
    expect(findMonoWeightMismatches('font-mono hover:font-bold')).toEqual([
      'font-mono + font-bold',
    ]);
  });

  it('passes font-mono at 400/500 and font-semibold without mono', () => {
    expect(mono("<i className='font-mono font-medium' /><b className='font-semibold' />")).toEqual(
      [],
    );
  });

  it('inline style: mono family with fontWeight 600+', () => {
    expect(mono("<i style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }} />")).toEqual([
      'style: fontFamily mono + fontWeight 700',
    ]);
    expect(mono("<i style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }} />")).toEqual([]);
    expect(mono("<i style={{ fontFamily: 'var(--font-sans)', fontWeight: 600 }} />")).toEqual([]);
  });

  it('inline style: the last property wins, spreads included', () => {
    const M = "const M = { fontFamily: 'var(--font-mono)' };\n";
    const W5 = 'const W = { fontWeight: 500 };\n';
    // A later spread overrides the heavy weight.
    expect(
      mono(`${W5}<i style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, ...W }} />`),
    ).toEqual([]);
    // A later sans family overrides the spread mono family.
    expect(
      mono(`${M}<i style={{ ...M, fontFamily: 'var(--font-sans)', fontWeight: 700 }} />`),
    ).toEqual([]);
    // A later heavy weight overrides a spread light one.
    expect(
      mono(`${W5}<i style={{ ...W, fontFamily: 'var(--font-mono)', fontWeight: 700 }} />`),
    ).toEqual(['style: fontFamily mono + fontWeight 700']);
  });

  it('inline style: resolves same-file const spreads recursively, through as / satisfies', () => {
    const chain =
      "const W = { fontWeight: 700 };\nconst M = { ...W };\n<i style={{ fontFamily: 'var(--font-mono)', ...M }} />";
    expect(mono(chain)).toEqual(['style: fontFamily mono + fontWeight 700']);
    const wrapped = [
      'const W = { fontWeight: 600 } as const;',
      'const M = ({ ...W }) satisfies React.CSSProperties;',
      "<i style={{ fontFamily: 'var(--font-mono)', ...(M as React.CSSProperties) }} />",
    ].join('\n');
    expect(mono(wrapped)).toEqual(['style: fontFamily mono + fontWeight 600']);
  });

  it('inline style: an unresolvable spread (import, call, parameter) is unknown, not flagged', () => {
    const imported =
      "import { W } from './w';\n<i style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, ...W }} />";
    expect(mono(imported)).toEqual([]);
    expect(
      mono("<i style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, ...f() }} />"),
    ).toEqual([]);
  });

  it('inline style: react-pdf files are exempt (their own fonts)', () => {
    const pdf =
      "import { Text } from '@react-pdf/renderer';\n<Text style={{ fontFamily: 'Courier', fontWeight: 700 }} />;\nconst s = { fontFamily: 'var(--font-mono)', fontWeight: 700 };";
    expect(mono(pdf)).toEqual([]);
  });

  it('CSS: mono family with weight 600+', () => {
    const css =
      '.a { font-family: var(--font-mono); font-weight: 600; }\n.b { font-family: var(--font-mono); font-weight: 500; }\n.c { font-weight: 700; }';
    expect(scanCssMonoWeight(css)).toEqual(['.a: font-weight 600']);
  });
});
