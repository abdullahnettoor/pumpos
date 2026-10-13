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

/**
 * Older #512 pitfalls. Reported by `scanSource` but not ratcheted: the test
 * requires zero of them in the dashboard / pump-ds / theme / shell scope.
 */
export interface Pitfalls {
  /** `border-t border-dashed`: the dash styles every side (see `findSideOnlyDash`). */
  'side-only-dash': string[];
  /** `className="… ${x}"`: a quoted string, so the `${…}` renders literally. */
  'quoted-interpolation': string[];
}
export type ScanResult = Findings & Pitfalls;

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
/**
 * A Tailwind variant prefix: `hover:`, `md:`, `group-hover:`, `data-[state=open]:`,
 * `*:`. Named, so a storage key (`pumpos:pending-stock-count`) is not a class.
 */
const VARIANT_PREFIX = new RegExp(
  String.raw`^!?(?:\*|@[\w-]*|(?:group|peer|has|not|in|data|aria|supports|max|min|motion|nth|forced|contrast|pointer|any-pointer)(?:-[\w-]*)?(?:-?\[[^\]]*\])?(?:\/[\w-]+)?|hover|focus|focus-visible|focus-within|active|disabled|enabled|visited|checked|required|invalid|valid|read-only|empty|first|last|only|odd|even|first-of-type|last-of-type|placeholder|placeholder-shown|before|after|selection|marker|file|backdrop|open|inert|target|indeterminate|autofill|default|sm|md|lg|xl|2xl|dark|print|portrait|landscape|ltr|rtl|starting):`,
);

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
/** Tailwind's default palette (and white/black): never valid in this design system. */
const PALETTE_CLASS = new RegExp(
  `^(?:bg|text|border(?:-[xytrblse])?|divide|ring(?:-offset)?|outline|from|via|to|fill|stroke|shadow|decoration|accent|caret|placeholder)-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/[\\w.[\\]]+)?$`,
);

/** Hex, `rgb(a)()` and `hsl(a)()`. Not `url(#id)`, an SVG reference. */
const RAW_COLOR_PATTERN = String.raw`(?<!url\()#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(`;
const RAW_COLOR = new RegExp(RAW_COLOR_PATTERN);
const RAW_COLORS = new RegExp(RAW_COLOR_PATTERN, 'g');
/** `var(--x)`, and Tailwind v4's `bg-(--x)` shorthand. */
const VAR_REF = /(?:var\(\s*|-\()(--[\w-]+)/g;

/** Strip variant prefixes (`hover:`, `md:`) and the `!` important marker. */
export function utilityOf(token: string): { variant: string; utility: string } {
  const at = token.lastIndexOf(':');
  const variant = at === -1 ? '' : token.slice(0, at);
  const utility = token.slice(at + 1).replace(/^!|!$/g, '');
  return { variant, utility };
}

/** A token with a utility prefix: a colour utility, a palette class, or a variant. */
const hasUtilityPrefix = (t: string) => {
  const { utility } = utilityOf(t);
  return VARIANT_PREFIX.test(t) || COLOR_UTILITY.test(utility) || PALETTE_CLASS.test(utility);
};

/**
 * A token that reads as a class, not a word of copy: class characters only, no
 * capitals and no trailing sentence punctuation outside `[…]` arbitrary values.
 */
const classShaped = (t: string) => {
  const outside = t.replace(/\[[^\]]*\]/g, '');
  return looksLikeClass(t) && !/[A-Z]/.test(outside) && !/[.,:;?'"]$/.test(outside);
};

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

/**
 * `border-dashed` / `border-dotted` set `border-style` on ALL four sides. With
 * no Preflight, the sides without an explicit width then draw at `medium`
 * (~3px): a side-only rule like `border-t border-dashed` becomes a thick dashed
 * frame. Dash one side with `border-t [--tw-border-style:dashed]` instead.
 */
const SIDE_WIDTH = /^border-[tblrxyse](-|$)/;
const ALL_WIDTH = /^border(-\d+|-\[[^\]]*px\])?$/;
function isSideOnlyDash(classString: string): boolean {
  const utilities = plainTokens(classString).map((t) => utilityOf(t).utility);
  if (!utilities.some((t) => t === 'border-dashed' || t === 'border-dotted')) return false;
  return utilities.some((t) => SIDE_WIDTH.test(t)) && !utilities.some((t) => ALL_WIDTH.test(t));
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
const knownLiteral = (node: ts.Node): Literal => literalOf(node) ?? NO_LITERAL;

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
/** Style properties whose values read like utilities (`transition: 'border-color 150ms'`). */
const CSS_VALUE_PROP = /^(transition\w*|willChange|boxSizing|verticalAlign|textAlign)$/;

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

/** Most class strings an expression is expanded into (ternary branches multiply). */
const MAX_VARIANTS = 64;

const unique = (xs: string[]) => [...new Set(xs)].slice(0, MAX_VARIANTS);
function product(left: string[], right: string[], sep: string): string[] {
  const out: string[] = [];
  for (const l of left) for (const r of right) out.push(`${l}${sep}${r}`);
  return unique(out);
}

/** `const` initializers by name, for names declared exactly once in the file. */
function constInitializers(sf: ts.SourceFile): Map<string, ts.Expression> {
  const found = new Map<string, ts.Expression | null>();
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const isConst =
        ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Const) !== 0;
      const name = n.name.text;
      found.set(name, found.has(name) || !isConst || !n.initializer ? null : n.initializer);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const out = new Map<string, ts.Expression>();
  for (const [name, init] of found) if (init) out.set(name, init);
  return out;
}

/**
 * Every class string an expression can produce: ternary branches, `cond &&`,
 * all args of one `cn()`, and `const`s / const object maps it names. Unknown
 * parts expand to ''. Each literal it reads is added to `touched`.
 */
function classVariants(
  node: ts.Node,
  consts: Map<string, ts.Expression>,
  touched: Set<ts.Node>,
  depth = 0,
): string[] {
  if (depth > 8) return [''];
  const recur = (n: ts.Node) => classVariants(n, consts, touched, depth + 1);
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  )
    return recur(node.expression);
  if (ts.isJsxExpression(node)) return node.expression ? recur(node.expression) : [''];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    touched.add(node);
    return [node.text];
  }
  if (ts.isTemplateExpression(node)) {
    touched.add(node);
    let acc = [node.head.text];
    for (const span of node.templateSpans)
      acc = product(product(acc, recur(span.expression), ''), [span.literal.text], '');
    return acc;
  }
  if (ts.isConditionalExpression(node))
    return unique([...recur(node.whenTrue), ...recur(node.whenFalse)]);
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return unique(['', ...recur(node.right)]);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
      return unique([...recur(node.left), ...recur(node.right)]);
    return [''];
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    CLASS_CALLS.has(node.expression.text)
  )
    return node.arguments.reduce<string[]>((acc, arg) => product(acc, recur(arg), ' '), ['']);
  if (ts.isArrayLiteralExpression(node))
    return node.elements.reduce<string[]>((acc, el) => product(acc, recur(el), ' '), ['']);
  if (ts.isIdentifier(node)) {
    const init = consts.get(node.text);
    return init ? recur(init) : [''];
  }
  const objectOf = (n: ts.Expression) => {
    const init = ts.isIdentifier(n) ? consts.get(n.text) : undefined;
    const obj =
      init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) ? init.expression : init;
    return obj && ts.isObjectLiteralExpression(obj) ? obj : undefined;
  };
  if (ts.isPropertyAccessExpression(node)) {
    const prop = objectOf(node.expression)?.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && propertyName(p.name) === node.name.text,
    );
    return prop ? recur(prop.initializer) : [''];
  }
  if (ts.isElementAccessExpression(node)) {
    const obj = objectOf(node.expression);
    if (!obj) return [''];
    return unique(
      obj.properties.filter(ts.isPropertyAssignment).flatMap((p) => recur(p.initializer)),
    );
  }
  return [''];
}

/** Every violation in one `.ts`/`.tsx` source, one entry per occurrence. */
export function scanSource(text: string, fileName: string, ctx: ScanContext): ScanResult {
  const findings: ScanResult = {
    'dead-class': [],
    'undefined-var': [],
    'raw-color': [],
    'palette-class': [],
    'fill-text-pair': [],
    'side-only-dash': [],
    'quoted-interpolation': [],
  };
  const plain = ctx.plainClasses ?? new Set<string>();
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);

  /** Literals that are class strings, and literals that are style values. */
  const classLits = new Set<ts.Node>();
  const styleLits = new Set<ts.Node>();
  const allLits: ts.Node[] = [];
  /** Expressions that are one class string as a whole (`className={…}`, `cn(…)`). */
  const classRoots: ts.Node[] = [];

  const collectInto = (root: ts.Node, into: Set<ts.Node>) => {
    const visit = (n: ts.Node) => {
      if (literalOf(n)) into.add(n);
      ts.forEachChild(n, visit);
    };
    visit(root);
  };

  const visit = (node: ts.Node, inRoot: boolean) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (literalOf(node)) allLits.push(node);
    let root = inRoot;
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (name === 'className' || name === 'class') {
        collectInto(node.initializer, classLits);
        if (!inRoot) classRoots.push(node.initializer);
        root = true;
        if (ts.isStringLiteral(node.initializer) && node.initializer.text.includes('${'))
          findings['quoted-interpolation'].push(node.initializer.text);
      }
      if (name === 'style') collectInto(node.initializer, styleLits);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CLASS_CALLS.has(node.expression.text)
    ) {
      node.arguments.forEach((a) => collectInto(a, classLits));
      if (!inRoot) classRoots.push(node);
      root = true;
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name === 'className') {
        collectInto(node.initializer, classLits);
        if (!inRoot) classRoots.push(node.initializer);
        root = true;
      } else if (name && CSS_COLOR_PROP.test(name) && literalOf(node.initializer))
        styleLits.add(node.initializer);
      else if (name && CSS_VALUE_PROP.test(name) && literalOf(node.initializer))
        styleLits.add(node.initializer);
    }
    ts.forEachChild(node, (child) => visit(child, root));
  };
  visit(sf, false);

  // Class maps outside className (`TONE = { warn: 'bg-line text-accent' }`,
  // `labelClassName="…"`): a literal is a class string when every token is
  // class-shaped and at least one has a utility prefix (colour utility,
  // palette class or variant). Whether the tokens compile does not matter: a
  // map of dead tokens is exactly what has to be caught.
  for (const node of allLits) {
    if (classLits.has(node) || styleLits.has(node)) continue;
    const toks = classTokens(knownLiteral(node));
    if (!toks.length || !toks.every(classShaped)) continue;
    if (toks.some((t) => CSS_KEYWORDS.has(t))) continue;
    if (!toks.some(hasUtilityPrefix)) continue;
    classLits.add(node);
    // A template outside className is one class string too (`${ok ? … : …} text-on-brand`).
    if (ts.isTemplateExpression(node)) classRoots.push(node);
  }

  for (const node of classLits) {
    const lit = knownLiteral(node);
    for (const token of classTokens(lit)) {
      if (!looksLikeClass(token) || !checkable(token)) continue;
      if (RAW_COLOR.test(token)) findings['raw-color'].push(token);
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

  // Pairs split across strings (`${ok ? 'bg-brand' : 'bg-danger-fg'} text-on-brand`,
  // `cn('bg-danger-fg', 'text-on-brand')`): expand each class root into the
  // class strings it can produce. A mismatch already counted on one of the
  // literals it read is not counted again.
  const consts = constInitializers(sf);
  for (const root of classRoots) {
    const touched = new Set<ts.Node>();
    const combined = new Set(
      classVariants(root, consts, touched).flatMap((v) => findFillTextMismatches(v)),
    );
    for (const lit of touched)
      for (const m of findFillTextMismatches(fullText(knownLiteral(lit)))) combined.delete(m);
    findings['fill-text-pair'].push(...combined);
  }

  // Raw colours anywhere else: style values, constants, ternaries, SVG
  // attributes. PDF renderers (react-pdf, pdfmake) have no CSS variables, so
  // hex is the only option there. A hex inside copy (`'Order #123'`) is not a
  // colour: copy has capitals outside the hex, CSS values do not.
  const isPdf = sf.statements.some(
    (st) =>
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      /^(@react-pdf\/renderer|pdfmake)/.test(st.moduleSpecifier.text),
  );
  for (const node of isPdf ? [] : allLits) {
    if (classLits.has(node)) continue;
    const value = fullText(knownLiteral(node));
    const prose = /[A-Z]/.test(value.replace(RAW_COLORS, ''));
    const label = styleLits.has(node) ? 'style' : 'value';
    for (const m of value.matchAll(RAW_COLORS)) {
      if (prose && m[0].startsWith('#')) continue;
      findings['raw-color'].push(`${label}: ${m[0]}`);
    }
  }

  for (const node of allLits)
    if (isSideOnlyDash(fullText(knownLiteral(node))))
      findings['side-only-dash'].push(fullText(knownLiteral(node)).trim());

  const defined = ctx.definedVars;
  if (defined) {
    for (const node of allLits) {
      const lit = knownLiteral(node);
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
