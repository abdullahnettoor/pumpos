// @vitest-environment jsdom
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
  stock: '6,000 L',
  detail: 'of 10,000 L · 60%',
  level: 'ok',
  cover: '',
  waitingOnDecantation: false,
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

  it('shows low-stock state and waiting on decantation together', () => {
    const { getByText } = render(
      <TankGauges
        tanks={[
          {
            ...tank(1),
            level: 'critical',
            pct: 8,
            stock: '800 L',
            detail: 'of 10,000 L · 8%',
            waitingOnDecantation: true,
          },
        ]}
      />,
    );
    expect(getByText('800 L', { exact: false }).className).toContain('text-bad');
    expect(getByText('of 10,000 L · 8%')).toBeTruthy();
    expect(getByText('Waiting on decantation')).toBeTruthy();
    expect(getByText('Critical')).toBeTruthy();
  });

  it('leads with the stock, plain unless the tank is low or critical (#609)', () => {
    const { getByText } = render(<TankGauges tanks={[tank(1)]} />);
    const head = getByText('6,000 L', { exact: false });
    expect(head.className).toContain('text-text-high');
    expect(head.className).not.toContain('text-good');
    expect(getByText('of 10,000 L · 60%')).toBeTruthy();
  });

  it('names the tone with the shared model words (desktop parity)', () => {
    const { getByText } = render(<TankGauges tanks={[{ ...tank(1), level: 'low', pct: 30 }]} />);
    expect(getByText('Low')).toBeTruthy();
  });
});
