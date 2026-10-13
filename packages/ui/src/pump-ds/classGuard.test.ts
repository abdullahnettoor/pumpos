/**
 * Class guard (#512): every Tailwind class in the dashboard, design system,
 * theme and shell must generate CSS against `pump-ds/tailwind.css`.
 *
 * Tailwind v4 silently skips unknown utilities (`bg-line`, `text-accent`) and
 * this app has no Preflight, so a dead class is invisible in review but shows
 * up as missing fills / dark `currentColor` borders. This compiles each token
 * with the repo's real `@theme` and fails on any that produce nothing.
 *
 * Run: `npm run test:classes -w @pump/ui`
 * A legitimate plain CSS class defined in `index.css` is allowed automatically;
 * add marker classes with no CSS (like `group`) to MARKER_CLASSES below.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);

/** Classes that intentionally generate no CSS. */
const MARKER_CLASSES = new Set(['group', 'peer', 'dark', 'sr-only-focusable', 'kpi-value']);

const SCOPES = [
  'components/Dashboard',
  'pump-ds',
  'theme',
  'components/AppShell.tsx',
  'components/AppTopBar.tsx',
];

function walk(target: string): string[] {
  const abs = path.join(SRC, target);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(target, name);
    return statSync(path.join(SRC, rel)).isDirectory() ? walk(rel) : [path.join(SRC, rel)];
  });
}

function sourceFiles(): string[] {
  return SCOPES.flatMap(walk).filter(
    (f) => /\.tsx?$/.test(f) && !/\.(test|dom\.test|stories)\.tsx?$/.test(f),
  );
}

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
function stringLiterals(text: string): string[] {
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
        out.push(...stringLiterals(text.slice(j + 2, end)));
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

/** String literals in `className=…` values and `cn(…)`/`clsx(…)` calls. */
function classContexts(text: string): string[] {
  const out: string[] = [];
  const re = /className=|\bcn\(|\bclsx\(|\btwMerge\(/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let start = m.index + m[0].length;
    if (m[0].endsWith('(')) start -= 1;
    const open = text[start];
    if (open === '"' || open === "'") {
      out.push(...stringLiterals(text.slice(start, text.indexOf(open, start + 1) + 1)));
    } else if (open === '{' || open === '(') {
      out.push(...stringLiterals(text.slice(start, balancedEnd(text, start) + 1)));
    }
  }
  return out;
}

const plainTokens = (s: string) => s.split(/\s+/).filter(Boolean);
const looksLikeClass = (t: string) => /^[!\w:/.\-[\]()%#&>*,=@'"+~^$_]+$/.test(t);
/**
 * Whether to verify a token. Bare words (`danger`, `sm`, `Log`) are variant
 * keys or prose inside `cn()` calls, and numbers are SVG data: skip both.
 */
const checkable = (t: string) =>
  /^[!a-z-[]/i.test(t) && /[-:/[]/.test(t) && !t.endsWith(':') && !t.endsWith('-');

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
      hit = new RegExp(`\\.${regexEscape(CSS.escape(token))}(?![\\w-])`).test(
        compiler.build([token]),
      );
      cache.set(token, hit);
    }
    return hit;
  };
}

/** Default-palette colours the design system forbids (spec): never valid even if Tailwind compiles them. */
const FORBIDDEN =
  /^(?:[a-z-]+:)*(?:bg|text|border|divide|ring|from|to|via|fill|stroke)-(?:white|black)(?:\/\d+)?$/;
const COLOR_UTILITY = /^(bg|text|border|divide|ring|from|to|via|fill|stroke|shadow|outline)-/;

/** Dead / forbidden tokens in `text`; `generates` decides whether a token compiles. */
export function findDeadTokens(
  text: string,
  generates: (t: string) => boolean,
  plain: Set<string> = new Set(),
): string[] {
  const dead: string[] = [];
  const candidates = new Set<string>(classContexts(text));
  // Class maps declared outside className (e.g. `TONE = { a: 'bg-x text-y' }`):
  // a literal counts when most of its tokens are real utilities. Single-token
  // colour utilities are also checked (`TONE_BAR = { a: 'bg-line' }`).
  for (const lit of stringLiterals(text)) {
    const toks = plainTokens(lit);
    if (!toks.length || !toks.every(looksLikeClass)) continue;
    if (toks.length === 1) {
      if (COLOR_UTILITY.test(toks[0]!)) candidates.add(lit);
      continue;
    }
    if (toks.filter((t) => generates(t)).length * 2 >= toks.length) candidates.add(lit);
  }
  for (const lit of candidates) {
    for (const token of plainTokens(lit)) {
      if (!looksLikeClass(token) || !checkable(token)) continue;
      if (FORBIDDEN.test(token)) {
        dead.push(token);
        continue;
      }
      if (MARKER_CLASSES.has(token) || plain.has(token)) continue;
      if (token.startsWith('group/') || token.startsWith('peer/')) continue;
      if (!generates(token)) dead.push(token);
    }
  }
  return dead;
}

const regexEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Minimal CSS.escape (node has none): enough for Tailwind candidates.
const CSS = {
  escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
};

function plainCssClasses(): Set<string> {
  const css = readFileSync(path.join(SRC, 'index.css'), 'utf8');
  return new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!));
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
  for (const lit of stringLiterals(text)) {
    const toks = plainTokens(lit).map((t) => t.replace(/^.*:/, ''));
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

describe('class guard: no class in dashboard / pump-ds / theme / shell is dead', () => {
  it('every className token compiles to CSS', async () => {
    const generates = await makeBuilder();
    const plain = plainCssClasses();
    const dead: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const t of findDeadTokens(text, generates, plain))
        dead.push(`${path.relative(SRC, file)}: ${t}`);
    }
    expect([...new Set(dead)].sort(), 'classes that generate no CSS').toEqual([]);
  });

  it('self-test: reports dead classes in .ts class maps and single-token values', async () => {
    const generates = await makeBuilder();
    const fixture =
      "const M = { a: 'bg-line' };\nconst x = <i className={`x ${M.a}`} />; const w = 'text-white';";
    expect(findDeadTokens(fixture, generates).sort()).toEqual(['bg-line', 'text-white']);
  });
  it('no side-only dashed borders (border-dashed styles every side)', () => {
    const bad: string[] = [];
    for (const file of sourceFiles())
      for (const lit of findSideOnlyDashes(readFileSync(file, 'utf8')))
        bad.push(`${path.relative(SRC, file)}: ${lit}`);
    expect(bad).toEqual([]);
    expect(findSideOnlyDashes("const R = 'border-t border-dashed px-3';")).toHaveLength(1);
    expect(findSideOnlyDashes("const R = 'border border-dashed';")).toHaveLength(0);
  });
  it('no ${…} inside a quoted className (it renders literally)', () => {
    const bad: string[] = [];
    for (const file of sourceFiles())
      for (const lit of findQuotedInterpolations(readFileSync(file, 'utf8')))
        bad.push(`${path.relative(SRC, file)}: ${lit}`);
    expect(bad).toEqual([]);
    expect(findQuotedInterpolations('<i className="size-2 ${SW[i]}" />')).toHaveLength(1);
    expect(findQuotedInterpolations('<i className={`size-2 ${SW[i]}`} />')).toHaveLength(0);
  });
});
