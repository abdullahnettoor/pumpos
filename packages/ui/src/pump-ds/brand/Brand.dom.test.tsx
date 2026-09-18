import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARK_PATH, MARK_VIEWBOX, PumpOSLockup, PumpOSMark } from './index.js';

/**
 * The canonical artwork lives at the repo root, and this suite runs under
 * jsdom (where `import.meta.url` is an http URL, not a file path), so walk up
 * from the working directory to find it rather than resolving from the module.
 */
function readCanonicalMark() {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, 'brand', 'pumpos-mark.svg');
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    if (dirname(dir) === dir) throw new Error('brand/pumpos-mark.svg not found');
  }
}

const canonicalSvg = readCanonicalMark();

function markOf(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no mark rendered');
  return svg;
}

describe('PumpOSMark', () => {
  it('draws the canonical artwork, so the component and the file cannot drift', () => {
    // `brand/pumpos-mark.svg` is the source of truth (it is what the sync
    // script fans out to every app); this component must draw the same shape.
    expect(canonicalSvg).toContain(`d="${MARK_PATH}"`);
    expect(canonicalSvg).toContain(`viewBox="${MARK_VIEWBOX}"`);
  });

  it('fills with currentColor so it takes the surrounding text color', () => {
    const { container } = render(<PumpOSMark />);

    expect(markOf(container).getAttribute('fill')).toBe('currentColor');
  });

  it('carries no hardcoded color of its own', () => {
    const { container } = render(<PumpOSMark />);

    expect(markOf(container).outerHTML).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('paints no surface of its own, so it is safe on any background', () => {
    // What makes one mark work on both a light and a brand-colored surface:
    // it draws only the glyph, and the nozzle is knocked out by the even-odd
    // rule rather than painted, so whatever sits behind shows through it.
    const { container } = render(<PumpOSMark />);
    const svg = markOf(container);

    expect(svg.getAttribute('fill-rule')).toBe('evenodd');
    expect(svg.querySelector('rect')).toBeNull();
    expect(svg.querySelectorAll('path')).toHaveLength(1);
  });

  it('is decorative by default', () => {
    const { container } = render(<PumpOSMark />);

    expect(markOf(container).getAttribute('aria-hidden')).toBe('true');
    expect(markOf(container).getAttribute('role')).toBeNull();
  });

  it('becomes an announced image once it is given a label', () => {
    const { container } = render(<PumpOSMark aria-label="PumpOS" />);

    expect(markOf(container).getAttribute('role')).toBe('img');
    expect(markOf(container).getAttribute('aria-hidden')).toBeNull();
  });

  it('scales with the surrounding text by default, and yields to an explicit size', () => {
    const { container } = render(<PumpOSMark />);
    expect(markOf(container).getAttribute('class')).toContain('h-[1em]');

    const sized = render(<PumpOSMark className="h-10" />);
    expect(markOf(sized.container).getAttribute('class')).toContain('h-10');
    expect(markOf(sized.container).getAttribute('class')).not.toContain('h-[1em]');
  });
});

describe('PumpOSLockup', () => {
  it('pairs the mark with the wordmark', () => {
    const { container } = render(<PumpOSLockup />);

    expect(markOf(container)).toBeTruthy();
    expect(screen.getByText('PumpOS')).toBeTruthy();
  });

  it('announces itself once, via the wordmark rather than a duplicate label', () => {
    const { container } = render(<PumpOSLockup />);

    expect(markOf(container).getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('PumpOS');
  });

  it('sets no color or font size, so it inherits both from where it is placed', () => {
    const { container } = render(<PumpOSLockup />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).not.toMatch(/\btext-(brand|\[|xs|sm|base|lg)/);
  });

  it('stacks the mark above the wordmark when asked', () => {
    const { container } = render(<PumpOSLockup orientation="stacked" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('flex-col');
  });
});

describe('mark legibility in the lockup', () => {
  it('sizes the mark above the cap height, where the nozzle cutout closes up', () => {
    const horizontal = render(<PumpOSLockup />);
    const stacked = render(<PumpOSLockup orientation="stacked" />);

    const em = (c: HTMLElement) =>
      Number(/h-\[([\d.]+)em\]/.exec(markOf(c).getAttribute('class') ?? '')?.[1]);
    expect(em(horizontal.container)).toBeGreaterThanOrEqual(1.5);
    expect(em(stacked.container)).toBeGreaterThan(em(horizontal.container));
  });
});
