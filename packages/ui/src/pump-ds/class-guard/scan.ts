/**
 * Style-check scanner (#517). Reads one source file with the TypeScript parser
 * and reports every violation of the style rules, one entry per occurrence.
 *
 * Pure: the caller supplies `generates` (does a token compile against
 * `pump-ds/tailwind.css`?) and the set of CSS variables defined anywhere, so
 * the rules can be tested on fixtures. The ratchet that compares the counts to
 * the committed allow-list lives in `ratchet.ts`.
 */
import ts from 'typescript';

export const RULES = [
  'dead-class',
  'undefined-var',
  'raw-color',
  'palette-class',
  'fill-text-pair',
] as const;
export type Rule = (typeof RULES)[number];
export type Findings = Record<Rule, string[]>;

export interface ScanContext {
  /** Whether a Tailwind token generates CSS. */
  generates: (token: string) => boolean;
  /** Plain CSS classes defined in `index.css` (allowed until the cleanup ticket). */
  plainClasses?: ReadonlySet<string>;
  /** Every `--name` defined anywhere (CSS files, `@theme`, inline `'--x':` props). */
  definedVars?: ReadonlySet<string>;
}

/** Classes that intentionally generate no CSS. */
const MARKER_CLASSES = new Set(['group', 'peer', 'dark', 'sr-only-focusable', 'kpi-value']);

/** Calls whose arguments are class strings. */
const CLASS_CALLS = new Set(['cn', 'clsx', 'twMerge', 'cva', 'cx']);

const plainTokens = (s: string) => s.split(/\s+/).filter(Boolean);
const looksLikeClass = (t: string) => /^[!\w:/.\-[\]()%#&>*,=@'"+~^$_]+$/.test(t);
/**
 * Whether to verify a token. Bare words (`danger`, `sm`, `Log`) are variant
 * keys or prose inside `cn()` calls, and numbers are SVG data: skip both.
 */
const checkable = (t: string) =>
  /^[!a-z[]/i.test(t) && /[-:/[]/.test(t) && !t.endsWith(':') && !t.endsWith('-');

/** CSS values that look like colour utilities (`boxSizing: 'border-box'`). */
const CSS_KEYWORDS = new Set([
  'border-box',
  'content-box',
  'padding-box',
  'text-top',
  'text-bottom',
]);

const COLOR_UTILITY = /^(bg|text|border|divide|ring|from|to|via|fill|stroke|shadow|outline)-/;

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
/** Tailwind's default palette (and white/black): never valid in this design system. */
const PALETTE_CLASS = new RegExp(
  `^(?:bg|text|border(?:-[xytrblse])?|divide|ring(?:-offset)?|outline|from|via|to|fill|stroke|shadow|decoration|accent|caret|placeholder)-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/[\\w.[\\]]+)?$`,
);

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/g;
/** `var(--x)`, and Tailwind v4's `bg-(--x)` shorthand. */
const VAR_REF = /(?:var\(\s*|-\()(--[\w-]+)/g;

/** Strip variant prefixes (`hover:`, `md:`) and the `!` important marker. */
export function utilityOf(token: string): { variant: string; utility: string } {
  const at = token.lastIndexOf(':');
  const variant = at === -1 ? '' : token.slice(0, at);
  const utility = token.slice(at + 1).replace(/^!|!$/g, '');
  return { variant, utility };
}

/**
 * Solid fills and the only `text-on-*` token allowed on each. Text colour on a
 * solid fill must be its pair, so dark mode can flip each pair on its own.
 */
export const SOLID_FILL_TEXT: Readonly<Record<string, string>> = {
  'bg-brand': 'text-on-brand',
  'bg-danger-fg': 'text-on-danger',
  'bg-brand-danger': 'text-on-danger',
  'bg-warning-fg': 'text-on-warning',
  'bg-brand-warning': 'text-on-warning',
  'bg-success-fg': 'text-on-success',
  'bg-info-fg': 'text-on-info',
  'bg-ink-strong': 'text-on-neutral',
};

/** `fill + text` mismatches in one class string, per state (base, `hover:`, …). */
export function findFillTextMismatches(classString: string): string[] {
  const fills = new Map<string, string>();
  const texts = new Map<string, string>();
  for (const token of plainTokens(classString)) {
    const { variant, utility } = utilityOf(token);
    if (SOLID_FILL_TEXT[utility]) fills.set(variant, utility);
    else if (/^text-on-[\w-]+$/.test(utility)) texts.set(variant, utility);
  }
  if (!fills.size || !texts.size) return [];
  const out: string[] = [];
  for (const state of new Set(['', ...fills.keys(), ...texts.keys()])) {
    const fill = fills.get(state) ?? fills.get('');
    const text = texts.get(state) ?? texts.get('');
    if (!fill || !text || SOLID_FILL_TEXT[fill] === text) continue;
    const prefix = state ? `${state}:` : '';
    out.push(`${prefix}${fill} + ${prefix}${text}`);
  }
  return out;
}

/** A literal's text pieces: whole string, or the static chunks of a template. */
interface Literal {
  /** Static chunks; a template's `${…}` splits them. */
  chunks: string[];
  /** For templates: whether chunk i is glued to an expression at its start / end. */
  gluedStart: boolean[];
  gluedEnd: boolean[];
}

function literalOf(node: ts.Node): Literal | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { chunks: [node.text], gluedStart: [false], gluedEnd: [false] };
  if (ts.isTemplateExpression(node)) {
    const chunks = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
    return {
      chunks,
      gluedStart: chunks.map((_, i) => i > 0),
      gluedEnd: chunks.map((_, i) => i < chunks.length - 1),
    };
  }
  return null;
}

const NO_LITERAL: Literal = { chunks: [], gluedStart: [], gluedEnd: [] };
/** `literalOf` for nodes already known to be literals. */
const litOf = (node: ts.Node): Literal => literalOf(node) ?? NO_LITERAL;

/**
 * Class tokens of a literal. A token touching a `${…}` (`bg-${tone}-fg`) is a
 * fragment, not a class, so it is dropped.
 */
function classTokens(lit: Literal): string[] {
  const out: string[] = [];
  lit.chunks.forEach((chunk, i) => {
    const toks = plainTokens(chunk);
    if (lit.gluedStart[i] && toks.length && !/^\s/.test(chunk)) toks.shift();
    if (lit.gluedEnd[i] && toks.length && !/\s$/.test(chunk)) toks.pop();
    out.push(...toks);
  });
  return out;
}

const fullText = (lit: Literal) => lit.chunks.join(' ');

const CSS_COLOR_PROP =
  /^(color|background(Color|Image)?|border(Top|Right|Bottom|Left|Block|Inline)?(Color)?|outline(Color)?|boxShadow|textShadow|fill|stroke|stopColor|caretColor|accentColor|textDecorationColor|columnRuleColor|--[\w-]+)$/;

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

/** Every violation in one `.ts`/`.tsx` source, one entry per occurrence. */
export function scanSource(text: string, fileName: string, ctx: ScanContext): Findings {
  const findings: Findings = {
    'dead-class': [],
    'undefined-var': [],
    'raw-color': [],
    'palette-class': [],
    'fill-text-pair': [],
  };
  const plain = ctx.plainClasses ?? new Set<string>();
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, kind);

  /** Literals that are class strings, and literals that are style values. */
  const classLits = new Set<ts.Node>();
  const styleLits = new Set<ts.Node>();
  const allLits: ts.Node[] = [];

  const collectInto = (root: ts.Node, into: Set<ts.Node>) => {
    const visit = (n: ts.Node) => {
      if (literalOf(n)) into.add(n);
      ts.forEachChild(n, visit);
    };
    visit(root);
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (literalOf(node)) allLits.push(node);
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (name === 'className' || name === 'class') collectInto(node.initializer, classLits);
      if (name === 'style') collectInto(node.initializer, styleLits);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CLASS_CALLS.has(node.expression.text)
    ) {
      node.arguments.forEach((a) => collectInto(a, classLits));
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name === 'className') collectInto(node.initializer, classLits);
      else if (name && CSS_COLOR_PROP.test(name) && literalOf(node.initializer))
        styleLits.add(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Class maps declared outside className (`TONE = { a: 'bg-x text-y' }`): a
  // literal counts when most of its tokens are real utilities. Single-token
  // colour utilities count too (`TONE_BAR = { a: 'bg-line' }`).
  for (const node of allLits) {
    if (classLits.has(node) || styleLits.has(node)) continue;
    const toks = classTokens(litOf(node));
    if (!toks.length || !toks.every(looksLikeClass)) continue;
    if (toks.length === 1) {
      if (CSS_KEYWORDS.has(toks[0])) continue;
      if (COLOR_UTILITY.test(toks[0]) || PALETTE_CLASS.test(utilityOf(toks[0]).utility))
        classLits.add(node);
      continue;
    }
    if (toks.filter((t) => ctx.generates(t)).length * 2 >= toks.length) classLits.add(node);
  }

  for (const node of classLits) {
    const lit = litOf(node);
    for (const token of classTokens(lit)) {
      if (!looksLikeClass(token) || !checkable(token)) continue;
      if (RAW_COLOR.test(token)) findings['raw-color'].push(token);
      RAW_COLOR.lastIndex = 0;
      if (PALETTE_CLASS.test(utilityOf(token).utility)) {
        findings['palette-class'].push(token);
        continue;
      }
      if (MARKER_CLASSES.has(token) || plain.has(token)) continue;
      if (token.startsWith('group/') || token.startsWith('peer/')) continue;
      if (!ctx.generates(token)) findings['dead-class'].push(token);
    }
    findings['fill-text-pair'].push(...findFillTextMismatches(fullText(lit)));
  }

  // PDF renderers (react-pdf, pdfmake) have no CSS variables: hex is the only option there.
  const isPdf = sf.statements.some(
    (st) =>
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      /^(@react-pdf\/renderer|pdfmake)/.test(st.moduleSpecifier.text),
  );
  for (const node of isPdf ? [] : styleLits) {
    if (classLits.has(node)) continue;
    for (const m of fullText(litOf(node)).matchAll(RAW_COLOR))
      findings['raw-color'].push(`style: ${m[0]}`);
  }

  const defined = ctx.definedVars;
  if (defined) {
    for (const node of allLits) {
      const lit = litOf(node);
      lit.chunks.forEach((chunk, i) => {
        for (const m of chunk.matchAll(VAR_REF)) {
          // `var(--state-${tone}-bg)`: a fragment, the full name is built at runtime.
          if (lit.gluedEnd[i] && m.index + m[0].length === chunk.length) continue;
          if (!isDefined(m[1], defined)) findings['undefined-var'].push(m[1]);
        }
      });
    }
  }
  return findings;
}

/** `--name`s referenced through `var(…)`. */
export function varRefs(text: string): string[] {
  return [...text.matchAll(VAR_REF)].map((m) => m[1]);
}

/** Tailwind's own `--tw-*` internals are always defined by the utilities that read them. */
const isDefined = (name: string, defined: ReadonlySet<string>) =>
  name.startsWith('--tw-') || defined.has(name);

/** Undefined `var(--x)` references in a CSS file. */
export function scanCss(text: string, defined: ReadonlySet<string>): string[] {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return varRefs(body).filter((n) => !isDefined(n, defined));
}

/** `--name`s a CSS file defines (`--x: …`). */
export function cssDefinitions(text: string): string[] {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
}

/** `--name`s a source file sets inline (`style={{ '--w': x }}`, `[--w:4px]`). */
export function sourceDefinitions(text: string): string[] {
  return [
    ...[...text.matchAll(/['"](--[\w-]+)['"]\s*:/g)].map((m) => m[1]),
    ...[...text.matchAll(/\[(--[\w-]+):/g)].map((m) => m[1]),
    ...[...text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)].map((m) => m[1]),
  ];
}
