// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TankGauge } from '../../lib/home/figures.js';
import { TankGauges } from './TankGauges.js';

afterEach(cleanup);

const tank = (n: number): TankGauge => ({
  id: `t${n}`,
  title: `DEMO-HSD-${n}`,
  tankName: `Tank ${n}`,
  pct: 60,
  fill: 60,
  volume: '6,000 L',
  level: 'ok',
  cover: '',
});

const columnsFor = (count: number) => {
  const { container } = render(
    <TankGauges tanks={Array.from({ length: count }, (_, i) => tank(i + 1))} />,
  );
  return (container.firstElementChild as HTMLElement).className;
};

describe('TankGauges grid', () => {
  it.each([
    [1, 'grid-cols-1'],
    [2, 'grid-cols-2'],
    [3, 'grid-cols-3'],
    [4, 'grid-cols-3'],
  ])('%i tank(s) use %s', (count, cls) => {
    const names = columnsFor(count)
      .split(/\s+/)
      .filter((c) => c.startsWith('grid-cols-'));
    expect(names).toEqual([cls]);
    cleanup();
  });

  it('renders one card per tank', () => {
    const { container } = render(<TankGauges tanks={[tank(1), tank(2)]} />);
    expect(container.querySelectorAll('[data-level]')).toHaveLength(2);
  });
});
