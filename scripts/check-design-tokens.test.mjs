import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vite-plus/test';
import {
  PATHS,
  checkDesignTokens,
  classTypography,
  frontMatter,
  parseCss,
} from './check-design-tokens.mjs';

const repo = {
  design: readFileSync(PATHS.design, 'utf8'),
  css: readFileSync(PATHS.css, 'utf8'),
  tailwind: readFileSync(PATHS.tailwind, 'utf8'),
  readSource: (file) => readFileSync(file, 'utf8'),
};

/** Run the check on the real repo with one DESIGN.md edit. */
const withDesign = (from, to) => {
  expect(repo.design).toContain(from);
  return checkDesignTokens({ ...repo, design: repo.design.replace(from, to) });
};

describe('DESIGN.md token guard', () => {
  it('passes on the repository as committed', () => {
    expect(checkDesignTokens(repo)).toEqual([]);
  });

  it('reports a colour that differs from index.css', () => {
    expect(withDesign("  primary: '#1F6A53'", "  primary: '#1F6A54'")).toEqual([
      'colors.primary is #1F6A54 but index.css --brand-primary is #1f6a53',
    ]);
  });

  it('reads dark-* colours from :root.dark', () => {
    expect(withDesign("  dark-primary: '#2FD18D'", "  dark-primary: '#1F6A53'")).toEqual([
      'colors.dark-primary is #1F6A53 but index.css :root.dark --brand-primary is #2fd18d',
    ]);
  });

  it('reports an index.css colour with no DESIGN.md entry', () => {
    expect(withDesign("  on-info: '#FFFFFF'\n", '')).toEqual([
      'DESIGN.md colors.on-info is missing (index.css light --text-on-info)',
    ]);
  });

  it('reports a colour key with no index.css variable', () => {
    expect(withDesign("  neutral: '#F6F7F4'", "  neutral: '#F6F7F4'\n  accent: '#000000'")).toEqual(
      ['colors.accent: no index.css variable mapped (add it to COLOR_VARS)'],
    );
  });

  it('checks typography against an index.css rule', () => {
    const errors = withDesign(
      '  drawer-title:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 15px',
      '  drawer-title:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 16px',
    );
    expect(errors).toEqual(['typography.drawer-title.fontSize is 16px but .drawer-title has 15px']);
  });

  it('checks typography against component classes', () => {
    const errors = withDesign(
      '  table-header:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 10px\n    fontWeight: 500',
      '  table-header:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 10px\n    fontWeight: 600',
    );
    expect(errors).toEqual([
      'typography.table-header.fontWeight is 600 but packages/ui/src/pump-ds/table/columns.tsx has 500',
    ]);
  });

  it('compares px and unitless line heights at the token size', () => {
    // body is 14px at line-height 1.42857: 20px.
    expect(withDesign('    lineHeight: 20px', '    lineHeight: 1.42857')).toEqual([]);
    expect(withDesign('    lineHeight: 20px', '    lineHeight: 22px')).toEqual([
      'typography.body-md.lineHeight is 22px but body has 20px',
    ]);
  });

  it('requires tabular digits to be documented where the code sets them', () => {
    const errors = withDesign(
      '    fontWeight: 400\n    fontFeature: \'"tnum" 1\'\n  data-dense:',
      '    fontWeight: 400\n  data-dense:',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^typography\.data-md\.fontFeature is unset/);
  });

  it('requires a source for every typography token', () => {
    expect(withDesign('typography:\n', 'typography:\n  hero:\n    fontSize: 40px\n')).toEqual([
      'typography.hero: no source in TYPOGRAPHY_SOURCES',
    ]);
  });

  it('checks radii and spacing', () => {
    expect(withDesign('  card: 10px', '  card: 12px')).toEqual([
      'rounded.card is 12px but index.css --radius-card is 10px',
    ]);
    expect(withDesign('  drawer: 460px', '  drawer: 420px')).toEqual([
      'spacing.drawer is 420px but index.css .drawer-container max-width is 460px',
    ]);
  });

  it('reports a component reference that does not resolve', () => {
    expect(withDesign("'{typography.kpi-figure}'", "'{typography.kpi-value}'")).toEqual([
      'components.kpi-tile.typography: {typography.kpi-value} does not resolve',
    ]);
  });

  it('reports a tailwind.css radius that no longer mirrors index.css', () => {
    const tailwind = repo.tailwind.replace('--radius-card: 10px;', '--radius-card: 6px;');
    expect(checkDesignTokens({ ...repo, tailwind })).toEqual([
      'tailwind.css @theme --radius-card is 6px but index.css has 10px',
    ]);
  });
});

describe('parsers', () => {
  it('reads nested maps, quoted scalars and folded text', () => {
    const md = [
      '---',
      'name: X',
      'description: >-',
      '  one',
      '  two',
      'colors:',
      "  primary: '#123456'",
      'typography:',
      '  data:',
      '    fontFeature: \'"tnum" 1\'',
      '---',
      '# Body',
    ].join('\n');
    expect(frontMatter(md)).toEqual({
      name: 'X',
      description: 'one two',
      colors: { primary: '#123456' },
      typography: { data: { fontFeature: '"tnum" 1' } },
    });
  });

  it('keeps the at-rule a CSS rule sits in', () => {
    const rules = parseCss(
      ':root { --a: #fff; } @media not print { :root.dark { --a: #000; } } @import "x";',
    );
    expect(rules.map((r) => [r.selectors, r.media, r.decls])).toEqual([
      [[':root'], null, { '--a': '#fff' }],
      [[':root.dark'], '@media not print', { '--a': '#000' }],
    ]);
  });

  it('reads typography off Tailwind classes, through variant prefixes', () => {
    expect(
      classTypography("md: '[&_.kpi-value]:text-[20px] font-mono font-semibold leading-tight'"),
    ).toEqual({ fontSize: 20, family: 'mono', fontWeight: 600, lineHeight: 1.25 });
    expect(classTypography('text-[12px] uppercase tracking-wide tabular-nums')).toEqual({
      fontSize: 12,
      letterSpacing: '0.025em',
      tnum: true,
    });
  });
});
