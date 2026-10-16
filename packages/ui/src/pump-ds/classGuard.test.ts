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
 * - `fill-text-pair` a solid tone fill with a `text-on-*` that is not its pair
 *                    (`bg-danger-fg text-on-brand`, `hover:` states too),
 *                    also when split across ternary branches or `cn()` args.
 * - `small-text`     text below the 12px floor (#515, #602): `text-[11px]`,
 *                    `text-[0.6rem]`, `text-2xs`, or a style `fontSize` under
 *                    12. PDF documents are skipped (print scale, not screen).
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
 * - `theme/config.ts` raw-color 2: `THEME_COLORS` is the canvas as literal hex
 *   because the pre-paint script sets `<meta name="theme-color">` before any
 *   CSS loads. `theme/tokens.test.ts` keeps it equal to `--bg-canvas`.
 * - `small-text` (#602), table headers only (10px uppercase, the one exception
 *   to the 12px floor): `pump-ds/table/columns.tsx` 1 (`HEADER`) and
 *   `components/primitives/DataTable.tsx` 1 (`HEADER_CLASS`).
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
import { describe, expect, it } from 'vitest';
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
  scanCss,
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
    if (undef.length) out.set(file, { ...emptyFindings(), 'undefined-var': undef });
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
      allowed = BASELINE ? baselineAllowList(actual) : lowerAllowList(actual, allowed);
      writeFileSync(ALLOW_LIST, `${JSON.stringify(allowed, null, 2)}\n`);
    }
    const problems = compareToAllowList(actual, allowed).map((p) =>
      p.actual > p.allowed
        ? `${p.file} [${p.rule}] ${p.actual} > allowed ${p.allowed}: fix the new violation (${tree.get(p.file)![p.rule].join(', ')})`
        : `${p.file} [${p.rule}] ${p.actual} < allowed ${p.allowed}: lower the entry with \`npm run test:classes:update -w @pump/ui\``,
    );
    expect(problems, 'style-check ratchet (class-guard/allowlist.json)').toEqual([]);
  });
});

/** A compiler that knows only `ok`. */
const fake = (ok: string[]) => ({ generates: (t: string) => ok.includes(t) });

describe('style check rules', () => {
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

  it('flags fontSize under 12 in style objects; PDF documents are exempt', () => {
    const style =
      "<i style={{ fontSize: 11 }} />; const s = { fontSize: '10px' }; const t = { fontSize: '12px', a: 9 };";
    expect(small(style)).toEqual(['fontSize: 11', 'fontSize: 10px']);
    expect(small(`import { Text } from '@react-pdf/renderer';\n${style}`)).toEqual([]);
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
