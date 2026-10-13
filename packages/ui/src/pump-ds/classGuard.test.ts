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
 * - `raw-color`      hex / `rgb(a)` in a class or a style value, including
 *                    fallbacks like `var(--text-on-brand, #fff)`.
 * - `palette-class`  Tailwind's default palette (`text-gray-500`, `text-white`).
 * - `fill-text-pair` a solid tone fill with a `text-on-*` that is not its pair
 *                    (`bg-danger-fg text-on-brand`, `hover:` states too).
 *
 * Today's violations are in `class-guard/allowlist.json` (rule → file →
 * count). The test fails when a file gains violations, when a file not on the
 * list has any, and when a file has FEWER than its entry: lower the entry with
 * `npm run test:classes:update -w @pump/ui`, which only ever lowers entries.
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
import { compareToAllowList, lowerAllowList, type Counts } from './class-guard/ratchet.js';
import {
  RULES,
  cssDefinitions,
  findFillTextMismatches,
  scanCss,
  scanSource,
  sourceDefinitions,
  type Findings,
} from './class-guard/scan.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW_LIST = path.join(SRC, 'pump-ds/class-guard/allowlist.json');
const UPDATE = process.env.CLASS_GUARD_UPDATE === '1';
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
    if (UPDATE) {
      allowed = lowerAllowList(actual, allowed);
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

describe('style check rules', () => {
  const fake = (ok: string[]) => ({ generates: (t: string) => ok.includes(t) });

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

  it('fill-text-pair: paired text-on-* utilities compile once mapped and pass the scan', () => {
    const ctx = fake(['bg-danger-fg', 'text-on-danger', 'bg-brand', 'text-on-brand']);
    const fixture =
      "<i className='bg-danger-fg text-on-danger' />; const B = 'bg-brand text-on-danger';";
    const f = scanSource(fixture, 'x.tsx', ctx);
    expect(f['dead-class']).toEqual([]);
    expect(f['fill-text-pair']).toEqual(['bg-brand + text-on-danger']);
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

  it('the committed allow-list is already lowered (sorted, no zero entries)', () => {
    const list = readAllowList();
    expect(lowerAllowList(list, list)).toEqual(list);
    expect(JSON.stringify(lowerAllowList(list, list))).toEqual(JSON.stringify(list));
  });
});

// ---------------------------------------------------------------------------
// Older checks (#512), still scoped to the dashboard / pump-ds / theme / shell.
// ---------------------------------------------------------------------------

const LEGACY_SCOPES = [
  'components/Dashboard/',
  'pump-ds/',
  'theme/',
  'components/AppShell.tsx',
  'components/AppTopBar.tsx',
];
const legacyScopeFiles = () =>
  SOURCE_FILES.filter((f) => LEGACY_SCOPES.some((s) => f === s || f.startsWith(s)));

/** Index of the matching close bracket for the opener at `start`. */
function balancedEnd(text: string, start: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (pairs[ch]) stack.push(pairs[ch]!);
    else if (stack.length && ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return text.length;
}

/** Literal chunks of every string in `text`, recursing into template `${…}` expressions. */
function stringChunks(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const q = text[i]!;
    if (q !== '"' && q !== "'" && q !== '`') {
      i++;
      continue;
    }
    let j = i + 1;
    let chunk = '';
    while (j < text.length && text[j] !== q) {
      if (text[j] === '\\') {
        j += 2;
        continue;
      }
      if (q === '`' && text[j] === '$' && text[j + 1] === '{') {
        const end = balancedEnd(text, j + 1);
        out.push(...stringChunks(text.slice(j + 2, end)));
        chunk += ' ';
        j = end + 1;
        continue;
      }
      chunk += text[j];
      j++;
    }
    out.push(chunk);
    i = j + 1;
  }
  return out;
}

/**
 * `border-dashed` / `border-dotted` set `border-style` on ALL four sides. With
 * no Preflight, the sides without an explicit width then draw at `medium`
 * (~3px): a side-only rule like `border-t border-dashed` becomes a thick dashed
 * frame. Dash one side with `border-t [--tw-border-style:dashed]` instead.
 */
const SIDE_WIDTH = /^border-[tblrxyse](-|$)/;
const ALL_WIDTH = /^border(-\d+|-\[[^\]]*px\])?$/;
export function findSideOnlyDashes(text: string): string[] {
  const out: string[] = [];
  for (const lit of stringChunks(text)) {
    const toks = lit
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/^.*:/, ''));
    if (!toks.some((t) => t === 'border-dashed' || t === 'border-dotted')) continue;
    if (toks.some((t) => SIDE_WIDTH.test(t)) && !toks.some((t) => ALL_WIDTH.test(t)))
      out.push(lit.trim());
  }
  return out;
}

/**
 * `className="… ${x}"` is a plain string, not a template: the `${…}` is
 * rendered literally and the class never applies (the Fuels swatch shipped
 * colourless this way). Interpolation needs `className={`…`}`.
 */
export function findQuotedInterpolations(text: string): string[] {
  const out: string[] = [];
  const re = /className=(["'])([^"']*\$\{[^"']*)\1/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[2]);
  return out;
}

describe('class guard: border and interpolation pitfalls (dashboard / pump-ds / theme / shell)', () => {
  it('no side-only dashed borders (border-dashed styles every side)', () => {
    const bad: string[] = [];
    for (const file of legacyScopeFiles())
      for (const lit of findSideOnlyDashes(read(file))) bad.push(`${file}: ${lit}`);
    expect(bad).toEqual([]);
    expect(findSideOnlyDashes("const R = 'border-t border-dashed px-3';")).toHaveLength(1);
    expect(findSideOnlyDashes("const R = 'border border-dashed';")).toHaveLength(0);
  });
  it('no ${…} inside a quoted className (it renders literally)', () => {
    const bad: string[] = [];
    for (const file of legacyScopeFiles())
      for (const lit of findQuotedInterpolations(read(file))) bad.push(`${file}: ${lit}`);
    expect(bad).toEqual([]);
    expect(findQuotedInterpolations('<i className="size-2 ${SW[i]}" />')).toHaveLength(1);
    expect(findQuotedInterpolations('<i className={`size-2 ${SW[i]}`} />')).toHaveLength(0);
  });
});
