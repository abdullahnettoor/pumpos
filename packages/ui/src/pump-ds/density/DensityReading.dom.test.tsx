// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DensityReading } from './DensityReading.js';
import type { DensityState } from './densityModel.js';

afterEach(cleanup);

const D = '2026-10-12';
const jump: DensityState = {
  kind: 'jump',
  density: 746,
  tempC: 30,
  observedDensity: 736.4,
  at: '2026-10-12T01:00:00Z',
  change: { delta: 5.2, from: '2026-10-11' },
};

describe('DensityReading', () => {
  it('shows value at 15 °C in mono, observed at temperature in station time, change and trend', () => {
    const { container } = render(
      <DensityReading
        state={{ ...jump, kind: 'recorded', change: { delta: 0.6, from: '2026-10-11' } }}
        trend={[740, 741]}
        timeZone="Pacific/Chatham"
        businessDate={D}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.state).toBe('recorded');
    expect(screen.getByText('Density at 15 °C')).toBeTruthy();
    expect(screen.getByText('746.0').className).toContain('font-mono');
    expect(screen.getByText('736.4 at 30 °C · 2:45 pm')).toBeTruthy();
    expect(screen.getByText('+0.6 vs yday').className).not.toContain('text-danger-fg');
    expect(screen.getByRole('img', { name: 'Density, last 14 days' })).toBeTruthy();
    expect(screen.queryByText('Unexplained jump')).toBeNull();
  });

  it('marks an unexplained jump in danger, sparkline included', () => {
    const { container } = render(
      <DensityReading state={jump} trend={[740, 746]} timeZone="Asia/Kolkata" businessDate={D} />,
    );
    expect(screen.getByText('Unexplained jump')).toBeTruthy();
    expect(screen.getByText('+5.2 vs yday').className).toContain('text-danger-fg');
    const path = container.querySelector('svg path:last-of-type') as SVGPathElement;
    expect(path.getAttribute('stroke')).toBe('var(--color-danger-fg)');
  });

  it('warns when not recorded and renders the caller action', () => {
    render(
      <DensityReading
        state={{ kind: 'not-recorded', last: 739 }}
        trend={[739]}
        businessDate={D}
        action={<button type="button">Record ›</button>}
      />,
    );
    expect(screen.getByText('Not recorded')).toBeTruthy();
    expect(screen.getByText('last 739.0')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record ›' })).toBeTruthy();
  });
});
