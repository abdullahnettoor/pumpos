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

  describe('mobile-only typography', () => {
    const withFile = (file, from, to) => {
      const text = readFileSync(file, 'utf8');
      expect(text).toContain(from);
      return checkDesignTokens({
        ...repo,
        readSource: (f) => (f === file ? text.replace(from, to) : readFileSync(f, 'utf8')),
      });
    };
    const heroConst = 'apps/mobile/src/ui/typography.ts';
    const heroSites = [
      'apps/mobile/src/screens/home/SalesHeadline.tsx',
      'apps/mobile/src/screens/money/HeroCard.tsx',
      'apps/mobile/src/ui/StatTile.tsx',
    ];
    const page = 'apps/mobile/src/ui/PageHeader.tsx';

    it('fails when the hero figure drifts in code (size, weight, tracking)', () => {
      expect(withFile(heroConst, 'text-[30px]', 'text-[28px]').join('\n')).toMatch(
        /mobile-hero-figure\.fontSize is 30px but .*typography\.ts .* has 28px/,
      );
      expect(withFile(heroConst, 'font-medium', 'font-semibold').join('\n')).toMatch(
        /mobile-hero-figure\.fontWeight is 500 but .* has 600/,
      );
      expect(withFile(heroConst, 'tracking-[-0.03em]', 'tracking-[-0.02em]').join('\n')).toMatch(
        /mobile-hero-figure\.letterSpacing is -0\.03em/,
      );
    });

    it('fails when a hero site adds its own line height, size or weight', () => {
      const [headline, card] = heroSites;
      const use = ['${HERO_FIGURE}', '${HERO_FIGURE}', '? HERO_FIGURE'];
      for (const extra of ['leading-[1.25]', 'leading-[30px]', 'leading-9']) {
        heroSites.forEach((file, i) => {
          expect(withFile(file, use[i], `${use[i]} ${extra}`).join('\n')).toMatch(
            new RegExp(`mobile-hero-figure\\.lineHeight .* but .*${file.split('/').pop()}`),
          );
        });
      }
      expect(withFile(headline, '${HERO_FIGURE}', '${HERO_FIGURE} font-bold').join('\n')).toMatch(
        /mobile-hero-figure\.fontWeight is 500 but .*SalesHeadline\.tsx has 700/,
      );
      expect(withFile(card, '${HERO_FIGURE}', '${HERO_FIGURE} text-[28px]').join('\n')).toMatch(
        /mobile-hero-figure\.fontSize/,
      );
    });

    it('fails when the page title drifts in code (size, weight, tracking, line height)', () => {
      expect(withFile(page, '[&_h1]:text-[22px]', '[&_h1]:text-[20px]').join('\n')).toMatch(
        /mobile-page-title\.fontSize is 22px but .* has 20px/,
      );
      expect(withFile(page, '[&_h1]:font-bold', '[&_h1]:font-semibold').join('\n')).toMatch(
        /mobile-page-title\.fontWeight is 700 but .* has 600/,
      );
      expect(withFile(page, 'tracking-[-0.03em]', 'tracking-[-0.02em]').join('\n')).toMatch(
        /mobile-page-title\.letterSpacing/,
      );
      for (const extra of [
        '[&_h1]:leading-[1.5]',
        '[&_h1]:leading-[40px]',
        '[&_h1]:leading-none',
      ]) {
        expect(withFile(page, '[&_h1]:truncate', `[&_h1]:truncate ${extra}`).join('\n')).toMatch(
          /mobile-page-title\.lineHeight/,
        );
      }
    });

    it('fails when the DESIGN.md entries drift (line height, family, weight)', () => {
      expect(withDesign('    lineHeight: 1.42857\n', '    lineHeight: 1.25\n').join('\n')).toMatch(
        /mobile-hero-figure\.lineHeight/,
      );
      expect(withDesign('    fontWeight: 700\n', '    fontWeight: 600\n').join('\n')).toMatch(
        /mobile-page-title\.fontWeight is 600 but/,
      );
      expect(withDesign('    fontSize: 30px', '    fontSize: 32px').join('\n')).toMatch(
        /mobile-hero-figure\.fontSize is 32px/,
      );
    });
  });

  it('requires a source for every typography token', () => {
    expect(withDesign('typography:\n', 'typography:\n  hero:\n    fontSize: 40px\n')).toEqual([
      'typography.hero: no source in TYPOGRAPHY_SOURCES',
    ]);
  });

  it('checks radii and spacing', () => {
    expect(withDesign('  tooltip: 6px', '  tooltip: 8px')).toEqual([
      'rounded.tooltip is 8px but index.css --radius-tooltip is 6px',
    ]);
    expect(withDesign('  timeline-popover: 224px', '  timeline-popover: 240px')).toEqual([
      'spacing.timeline-popover is 240px but index.css --timeline-popover-width is 224px',
    ]);
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
    expect(
      checkDesignTokens({
        ...repo,
        tailwind: repo.tailwind.replace('--radius-tooltip: 6px;', '--radius-tooltip: 8px;'),
      }),
    ).toEqual(['tailwind.css @theme --radius-tooltip is 8px but index.css has 6px']);
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
