#!/usr/bin/env node
/**
 * Fail the build when DESIGN.md's tokens drift from the code.
 *
 * DESIGN.md (Google Stitch format) is the design source of truth for people
 * and agents, but the values that ship live in `packages/ui/src/index.css` and
 * a few pump-ds components. The two drifted silently before, so this checks
 * the front matter against the code:
 *
 * - colors: every key maps to an index.css variable (`dark-*` keys to the
 *   `:root.dark` value), and every `--bg|border|text|brand|state-*` variable
 *   has a key, so a new colour token cannot ship undocumented.
 * - typography: every token names its source (a CSS rule in index.css, or the
 *   line of a pump-ds component that sets its classes) in TYPOGRAPHY_SOURCES;
 *   family, size, weight, letter spacing, tabular digits and any documented
 *   line height must match.
 * - rounded: keys equal `--radius-*` both ways, and tailwind.css's inlined
 *   radii equal index.css.
 * - spacing: `space-N` keys equal `--space-N` both ways; `status-bar` and the
 *   drawer widths match index.css. Other spacing keys are component sizes.
 * - components: every `{group.key}` reference resolves.
 */
import { readFileSync } from 'node:fs';

export const PATHS = {
  design: 'DESIGN.md',
  css: 'packages/ui/src/index.css',
  tailwind: 'packages/ui/src/pump-ds/tailwind.css',
};

/** DESIGN.md colour key (light) -> index.css variable. `dark-<key>` reads `:root.dark`. */
export const COLOR_VARS = {
  primary: '--brand-primary',
  secondary: '--brand-secondary',
  tertiary: '--brand-warning',
  error: '--brand-danger',
  neutral: '--bg-canvas',
  surface: '--bg-surface',
  'surface-alt': '--bg-surface-alt',
  'border-soft': '--border-soft',
  'border-strong': '--border-strong',
  'on-surface': '--text-strong',
  'text-default': '--text-default',
  'text-muted': '--text-muted',
  'text-faint': '--text-faint',
  'on-primary': '--text-on-brand',
  'success-bg': '--state-success-bg',
  'success-fg': '--state-success-fg',
  'warning-bg': '--state-warning-bg',
  'warning-fg': '--state-warning-fg',
  'danger-bg': '--state-danger-bg',
  'danger-fg': '--state-danger-fg',
  'info-bg': '--state-info-bg',
  'info-fg': '--state-info-fg',
  'on-danger': '--text-on-danger',
  'on-warning': '--text-on-warning',
  'on-success': '--text-on-success',
  'on-info': '--text-on-info',
  'on-neutral': '--text-on-neutral',
};
const COLOR_VAR_FAMILY = /^--(bg|border|text|brand|state)-/;

const BUTTON = 'packages/ui/src/pump-ds/button/Button.tsx';
const CHIP = 'packages/ui/src/pump-ds/chip/Chip.tsx';
const COLUMNS = 'packages/ui/src/pump-ds/table/columns.tsx';
const KPI = 'packages/ui/src/pump-ds/kpi/KpiTile.tsx';

/**
 * Where each typography token is set. `css` names an exact selector in
 * index.css; `file` + `match` names the first line of a component containing
 * `match`, read as Tailwind classes. Several sources merge, later ones winning.
 */
export const TYPOGRAPHY_SOURCES = {
  'page-title': [{ file: 'packages/ui/src/pump-ds/page-header/PageHeader.tsx', match: '<h1 ' }],
  'drawer-title': [{ css: '.drawer-title' }],
  'body-md': [{ css: 'body' }],
  'body-sm': [{ css: '.input' }],
  'label-md': [
    { file: BUTTON, match: "'font-sans font-semibold rounded-button" },
    { file: BUTTON, match: "md: 'h-9" },
  ],
  'field-label': [{ css: '.field-label' }],
  caption: [{ css: '.field-hint' }],
  chip: [
    { file: CHIP, match: 'rounded-chip font-medium' },
    { file: CHIP, match: "sm: 'h-[22px]" },
  ],
  'section-label': [
    { file: 'packages/ui/src/pump-ds/section-header/SectionHeader.tsx', match: '<h2 ' },
  ],
  'table-header': [{ file: COLUMNS, match: 'const HEADER =' }],
  'data-md': [
    { file: 'packages/ui/src/pump-ds/table/GroupedTable.tsx', match: '<table aria-label' },
    { file: COLUMNS, match: 'const NUMERIC =' },
  ],
  'data-dense': [
    {
      file: 'packages/ui/src/pump-ds/statement-table/StatementTable.tsx',
      match: "'w-full border-collapse text-[",
    },
    { file: COLUMNS, match: 'const NUMERIC =' },
  ],
  'kpi-figure': [
    { file: KPI, match: "md: '[&_.kpi-value]" },
    { file: KPI, match: "'kpi-value " },
  ],
  'amount-input': [{ css: '.input.record-amount-input' }],
};

/** Spacing keys checked against index.css; other keys are component sizes. */
export const SPACING_SOURCES = {
  'status-bar': { variable: '--status-bar-height' },
  drawer: { css: '.drawer-container', prop: 'max-width' },
  'drawer-wide': { css: '.drawer-container--wide', prop: 'max-width' },
};

// ---------------------------------------------------------------- parsing --

/** The YAML subset DESIGN.md front matter uses: nested maps, scalars, `>-`. */
export function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^( *)([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) throw new Error(`DESIGN.md front matter line ${i + 2}: cannot parse "${line}"`);
    const indent = m[1].length;
    while (stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    const raw = (m[3] ?? '').trim();
    if (raw === '') {
      parent[m[2]] = {};
      stack.push({ indent, obj: parent[m[2]] });
    } else if (raw === '>-' || raw === '>' || raw === '|') {
      const block = [];
      const indentOf = (l) => l.length - l.trimStart().length;
      while (i + 1 < lines.length && (!lines[i + 1].trim() || indentOf(lines[i + 1]) > indent)) {
        block.push(lines[++i].trim());
      }
      parent[m[2]] = block.join(raw === '|' ? '\n' : ' ').trim();
    } else {
      parent[m[2]] = unquote(raw);
    }
  }
  return root;
}

function unquote(raw) {
  if (/^'.*'$/.test(raw)) return raw.slice(1, -1).replace(/''/g, "'");
  if (/^".*"$/.test(raw)) return JSON.parse(raw);
  return raw.replace(/\s+#.*$/, '');
}

export function frontMatter(markdown) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!m) throw new Error('DESIGN.md has no YAML front matter');
  return parseYaml(m[1]);
}

/** Style rules with their enclosing at-rule (`media`, null at top level). */
export function parseCss(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      if (prelude.startsWith('@')) stack.push({ at: prelude });
      else {
        const media = [...stack].reverse().find((s) => s.at)?.at ?? null;
        stack.push({ selectors: prelude.split(',').map((s) => s.trim()), media });
      }
    } else if (ch === '}') {
      const top = stack.pop();
      if (top?.selectors) rules.push({ ...top, decls: parseDecls(buf) });
      buf = '';
    } else if (ch === ';' && !stack[stack.length - 1]?.selectors) {
      buf = '';
    } else {
      buf += ch;
    }
  }
  return rules;
}

function parseDecls(body) {
  const decls = {};
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    decls[part.slice(0, at).trim()] = part
      .slice(at + 1)
      .trim()
      .replace(/\s+/g, ' ');
  }
  return decls;
}

function declsFor(rules, selector, media = null) {
  const out = {};
  for (const r of rules) {
    if (r.media === media && r.selectors.includes(selector)) Object.assign(out, r.decls);
  }
  return out;
}

const WEIGHTS = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const LEADING = { none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625 };
const TRACKING = { tight: '-0.025em', normal: '0em', wide: '0.025em', wider: '0.05em' };

/** Typography read off Tailwind classes; variant prefixes are dropped. */
export function classTypography(line) {
  const props = {};
  for (const token of line.match(/[^\s'"`{}(),]+/g) ?? []) {
    const cls = token.replace(/^(?:\[[^\]]*\]:|[a-z-]+:)+/, '');
    let m;
    if ((m = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(cls))) props.fontSize = Number(m[1]);
    else if ((m = /^font-(normal|medium|semibold|bold)$/.exec(cls)))
      props.fontWeight = WEIGHTS[m[1]];
    else if (cls === 'font-mono') props.family = 'mono';
    else if (cls === 'font-sans') props.family = 'sans';
    else if ((m = /^leading-(none|tight|snug|normal|relaxed)$/.exec(cls)))
      props.lineHeight = LEADING[m[1]];
    else if ((m = /^tracking-(tight|normal|wide|wider)$/.exec(cls)))
      props.letterSpacing = TRACKING[m[1]];
    else if ((m = /^tracking-\[([^\]]+)\]$/.exec(cls))) props.letterSpacing = m[1];
    else if (cls === 'tabular-nums') props.tnum = true;
  }
  return props;
}

function cssTypography(decls) {
  const props = {};
  if (decls['font-size']) props.fontSize = parseFloat(decls['font-size']);
  if (decls['font-weight']) props.fontWeight = Number(decls['font-weight']);
  if (decls['font-family']) {
    const v = /var\((--[\w-]+)\)/.exec(decls['font-family']);
    props.family = v
      ? v[1] === '--font-mono'
        ? 'mono'
        : 'sans'
      : firstFamily(decls['font-family']);
  }
  if (decls['line-height']) props.lineHeight = decls['line-height'];
  if (decls['letter-spacing']) props.letterSpacing = decls['letter-spacing'];
  if (decls['font-variant-numeric']?.includes('tabular-nums')) props.tnum = true;
  return props;
}

const firstFamily = (stack) =>
  stack
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '');

/** A line height in px: `20px` as is, a unitless multiplier times the size. */
function lineHeightPx(value, fontSize) {
  const s = String(value);
  if (s.endsWith('px')) return parseFloat(s);
  return Number(s) * fontSize;
}

const sameColor = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const sameLength = (a, b) => String(a).replace(/\s/g, '') === String(b).replace(/\s/g, '');
const emLength = (v) => (v == null ? 0 : parseFloat(v));

// ------------------------------------------------------------------ check --

/**
 * @param {{ design: string, css: string, tailwind: string, readSource: (file: string) => string }} input
 * @returns {string[]} one message per drift
 */
export function checkDesignTokens({ design, css, tailwind, readSource }) {
  const errors = [];
  const tokens = frontMatter(design);
  const rules = parseCss(css);
  const light = declsFor(rules, ':root.light');
  const dark = declsFor(rules, ':root.dark', '@media not print');
  const family = {
    sans: firstFamily(light['--font-sans'] ?? ''),
    mono: firstFamily(light['--font-mono'] ?? ''),
  };

  // colors
  const colors = tokens.colors ?? {};
  for (const [key, value] of Object.entries(colors)) {
    const isDark = key.startsWith('dark-');
    const variable = COLOR_VARS[isDark ? key.slice(5) : key];
    if (!variable) {
      errors.push(`colors.${key}: no index.css variable mapped (add it to COLOR_VARS)`);
      continue;
    }
    const actual = (isDark ? dark : light)[variable];
    if (actual === undefined) errors.push(`colors.${key}: ${variable} is not defined in index.css`);
    else if (!sameColor(actual, value))
      errors.push(
        `colors.${key} is ${value} but index.css ${isDark ? ':root.dark ' : ''}${variable} is ${actual}`,
      );
  }
  const byVar = Object.fromEntries(Object.entries(COLOR_VARS).map(([k, v]) => [v, k]));
  for (const [theme, vars, prefix] of [
    ['light', light, ''],
    ['dark', dark, 'dark-'],
  ]) {
    for (const variable of Object.keys(vars).filter((v) => COLOR_VAR_FAMILY.test(v))) {
      const key = byVar[variable];
      if (!key)
        errors.push(
          `index.css ${theme} ${variable} has no DESIGN.md colour (add it to COLOR_VARS)`,
        );
      else if (!(prefix + key in colors))
        errors.push(`DESIGN.md colors.${prefix}${key} is missing (index.css ${theme} ${variable})`);
    }
  }

  // typography
  const typography = tokens.typography ?? {};
  for (const name of Object.keys(TYPOGRAPHY_SOURCES)) {
    if (!(name in typography)) errors.push(`typography.${name} is missing from DESIGN.md`);
  }
  const body = cssTypography(declsFor(rules, 'body'));
  for (const [name, doc] of Object.entries(typography)) {
    const sources = TYPOGRAPHY_SOURCES[name];
    if (!sources) {
      errors.push(`typography.${name}: no source in TYPOGRAPHY_SOURCES`);
      continue;
    }
    const actual = { family: 'sans', fontWeight: 400 };
    let missing = false;
    for (const src of sources) {
      if (src.css) {
        const decls = declsFor(rules, src.css);
        if (!Object.keys(decls).length) {
          errors.push(`typography.${name}: index.css has no rule "${src.css}"`);
          missing = true;
        }
        Object.assign(actual, cssTypography(decls));
      } else {
        const line = readSource(src.file)
          .split('\n')
          .find((l) => l.includes(src.match));
        if (!line) {
          errors.push(`typography.${name}: no line containing "${src.match}" in ${src.file}`);
          missing = true;
        } else Object.assign(actual, classTypography(line));
      }
    }
    if (missing) continue;
    const where = sources.map((s) => s.css ?? s.file).join(' + ');
    const fail = (what, docValue, codeValue) =>
      errors.push(`typography.${name}.${what} is ${docValue} but ${where} has ${codeValue}`);

    if (doc.fontFamily !== family[actual.family])
      fail('fontFamily', doc.fontFamily, family[actual.family]);
    if (actual.fontSize === undefined) fail('fontSize', doc.fontSize, 'no font size');
    else if (parseFloat(doc.fontSize) !== actual.fontSize)
      fail('fontSize', doc.fontSize, `${actual.fontSize}px`);
    if (Number(doc.fontWeight) !== actual.fontWeight)
      fail('fontWeight', doc.fontWeight, actual.fontWeight);
    if (emLength(doc.letterSpacing) !== emLength(actual.letterSpacing))
      fail('letterSpacing', doc.letterSpacing ?? 'unset', actual.letterSpacing ?? 'unset');
    const docTnum = /tnum/.test(doc.fontFeature ?? '');
    if (docTnum !== Boolean(actual.tnum))
      fail(
        'fontFeature',
        doc.fontFeature ?? 'unset',
        actual.tnum ? 'tabular-nums' : 'no tabular-nums',
      );
    if (doc.lineHeight !== undefined && actual.fontSize !== undefined) {
      const code = lineHeightPx(actual.lineHeight ?? body.lineHeight, actual.fontSize);
      if (Math.abs(lineHeightPx(doc.lineHeight, actual.fontSize) - code) > 0.05)
        fail('lineHeight', doc.lineHeight, `${+code.toFixed(2)}px`);
    }
  }

  // rounded
  const rounded = tokens.rounded ?? {};
  const radii = Object.keys(light).filter((v) => v.startsWith('--radius-'));
  for (const [key, value] of Object.entries(rounded)) {
    const actual = light[`--radius-${key}`];
    if (actual === undefined)
      errors.push(`rounded.${key}: --radius-${key} is not defined in index.css`);
    else if (!sameLength(actual, value))
      errors.push(`rounded.${key} is ${value} but index.css --radius-${key} is ${actual}`);
  }
  for (const v of radii) {
    if (!(v.slice('--radius-'.length) in rounded))
      errors.push(`DESIGN.md rounded.${v.slice(9)} is missing (index.css ${v})`);
  }
  const themeBody = /@theme\s*\{([^}]*)\}/.exec(tailwind.replace(/\/\*[\s\S]*?\*\//g, ''));
  const themeDecls = themeBody ? parseDecls(themeBody[1]) : {};
  for (const v of radii) {
    if (themeDecls[v] !== undefined && !sameLength(themeDecls[v], light[v]))
      errors.push(`tailwind.css @theme ${v} is ${themeDecls[v]} but index.css has ${light[v]}`);
  }

  // spacing
  const spacing = tokens.spacing ?? {};
  for (const [key, value] of Object.entries(spacing)) {
    let actual;
    let label;
    if (/^space-\d+$/.test(key)) {
      label = `--${key}`;
      actual = light[label];
    } else if (SPACING_SOURCES[key]) {
      const src = SPACING_SOURCES[key];
      label = src.variable ?? `${src.css} ${src.prop}`;
      actual = src.variable ? light[src.variable] : declsFor(rules, src.css)[src.prop];
    } else continue;
    if (actual === undefined) errors.push(`spacing.${key}: ${label} is not defined in index.css`);
    else if (!sameLength(actual, value))
      errors.push(`spacing.${key} is ${value} but index.css ${label} is ${actual}`);
  }
  for (const v of Object.keys(light).filter((v) => /^--space-\d+$/.test(v))) {
    if (!(v.slice(2) in spacing))
      errors.push(`DESIGN.md spacing.${v.slice(2)} is missing (index.css ${v})`);
  }

  // component references
  for (const [component, props] of Object.entries(tokens.components ?? {})) {
    for (const [prop, value] of Object.entries(props)) {
      const ref = /^\{([\w-]+)\.([\w-]+)\}$/.exec(String(value));
      if (ref && !(tokens[ref[1]] && ref[2] in tokens[ref[1]]))
        errors.push(`components.${component}.${prop}: ${value} does not resolve`);
    }
  }

  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = checkDesignTokens({
    design: readFileSync(PATHS.design, 'utf8'),
    css: readFileSync(PATHS.css, 'utf8'),
    tailwind: readFileSync(PATHS.tailwind, 'utf8'),
    readSource: (file) => readFileSync(file, 'utf8'),
  });
  if (errors.length) {
    console.error(`DESIGN.md tokens drift from the code (${errors.length}):\n`);
    for (const e of errors) console.error(`  ${e}`);
    console.error(
      '\nThe code is the source of truth: update DESIGN.md, or fix the code if the doc is right.',
    );
    process.exit(1);
  }
  console.log('DESIGN.md tokens match the code.');
}
