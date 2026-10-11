// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import pkg from '../../package.json' with { type: 'json' };
import { BrandFooter } from './BrandFooter.js';

describe('BrandFooter', () => {
  afterEach(cleanup);

  it('shows the PumpOS name with the build version from package.json', () => {
    render(<BrandFooter />);
    expect(screen.getByText(`PumpOS · v${pkg.version}`)).toBeDefined();
  });

  it('draws the mark as decoration, so the name is not read twice', () => {
    const { container } = render(<BrandFooter />);
    const mark = container.querySelector('svg');
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
  });
});
