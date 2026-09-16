// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Icon } from './Icon.js';

afterEach(cleanup);

describe('Icon component', () => {
  it('renders default icon at md size with decorative accessibility contract', () => {
    const { container } = render(<Icon name="plus" data-testid="test-icon" />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');
    expect(svg?.getAttribute('stroke-width')).toBe('2');
    expect(svg?.classList.contains('size-[18px]')).toBe(true);
    expect(svg?.classList.contains('shrink-0')).toBe(true);
  });

  it('applies size variants and default stroke widths correctly', () => {
    const { container: cXs } = render(<Icon name="plus" size="xs" />);
    const svgXs = cXs.querySelector('svg');
    expect(svgXs?.classList.contains('size-3.5')).toBe(true);
    expect(svgXs?.getAttribute('width')).toBe('14');
    expect(svgXs?.getAttribute('height')).toBe('14');
    expect(svgXs?.getAttribute('stroke-width')).toBe('1.5');

    const { container: cSm } = render(<Icon name="plus" size="sm" />);
    const svgSm = cSm.querySelector('svg');
    expect(svgSm?.classList.contains('size-4')).toBe(true);
    expect(svgSm?.getAttribute('width')).toBe('16');
    expect(svgSm?.getAttribute('height')).toBe('16');
    expect(svgSm?.getAttribute('stroke-width')).toBe('1.75');

    const { container: cLg } = render(<Icon name="plus" size="lg" />);
    const svgLg = cLg.querySelector('svg');
    expect(svgLg?.classList.contains('size-5')).toBe(true);
    expect(svgLg?.getAttribute('width')).toBe('20');
    expect(svgLg?.getAttribute('height')).toBe('20');
    expect(svgLg?.getAttribute('stroke-width')).toBe('2');
  });

  it('allows overriding strokeWidth', () => {
    const { container } = render(<Icon name="plus" size="md" strokeWidth={1.5} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });

  it('implements the accessible image contract when aria-label is provided', () => {
    render(<Icon name="plus" aria-label="Add new record" />);
    const icon = screen.getByRole('img', { name: 'Add new record' });

    expect(icon).not.toBeNull();
    expect(icon.getAttribute('aria-hidden')).toBeNull();
    expect(icon.getAttribute('aria-label')).toBe('Add new record');
  });

  it('merges custom className with default classes', () => {
    const { container } = render(
      <Icon name="check" className="text-success-fg hover:opacity-80" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('text-success-fg')).toBe(true);
    expect(svg?.classList.contains('hover:opacity-80')).toBe(true);
    expect(svg?.classList.contains('shrink-0')).toBe(true);
  });

  it('supports domain aliases', () => {
    const { container: cFuel } = render(<Icon name="fuel" />);
    const { container: cDispenser } = render(<Icon name="dispenser" />);
    const svgFuel = cFuel.querySelector('svg');
    const svgDispenser = cDispenser.querySelector('svg');

    expect(svgFuel).not.toBeNull();
    expect(svgDispenser).not.toBeNull();
    // Both render the Fuel icon paths
    expect(svgFuel?.innerHTML).toBe(svgDispenser?.innerHTML);
  });

  it('gracefully returns null and warns when unknown icon name is supplied', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // @ts-expect-error Testing invalid name at runtime
    const { container } = render(<Icon name="unknown-icon-does-not-exist" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
