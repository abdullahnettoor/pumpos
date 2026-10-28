// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { DEFAULT_TANK_LEVEL_SETTINGS, deriveTankLevel } from '@pump/shared';
import { TankGauge } from './TankGauge.js';
import { stockOfCapacity } from './stockOfCapacity.js';

afterEach(cleanup);

const level = (currentVolume: number, extra: Record<string, unknown> = {}) =>
  deriveTankLevel({ capacity: 20_000, currentVolume, ...extra }, DEFAULT_TANK_LEVEL_SETTINGS);

// #603: lead with the stock; stock and capacity share one unit and precision.
describe('stockOfCapacity', () => {
  it('reads litres whole, with the % on the capacity line', () => {
    expect(stockOfCapacity(13_000, 20_000, undefined, 65)).toEqual({
      stock: '13,000 L',
      detail: 'of 20,000 L · 65%',
    });
    expect(stockOfCapacity(12_400.4, 12_500, 'litres', 99).stock).toBe('12,400 L');
  });

  it('reads kg for CNG, and no capacity line without a capacity', () => {
    expect(stockOfCapacity(1_200, 2_000, 'kg', 60)).toEqual({
      stock: '1,200 kg',
      detail: 'of 2,000 kg · 60%',
    });
    expect(stockOfCapacity(1_200, 0, 'kg').detail).toBe('');
  });
});

describe('TankGauge', () => {
  it.each(['tube', 'bar'] as const)(
    'shows %% in tone, stock of capacity and days of cover (%s)',
    (variant) => {
      const { container } = render(
        <TankGauge name="Tank 1" level={level(4_000, { daysOfCover: 2.6 })} variant={variant} />,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.dataset.tone).toBe('critical');
      expect(screen.getByText('4,000 L').className).toContain('text-danger-fg');
      expect(screen.getByText('of 20,000 L · 20%')).toBeTruthy();
      expect(root.textContent).not.toMatch(/KL/);
      expect(root.textContent).toContain('2.6 days cover');
      expect(screen.getByText('Critical')).toBeTruthy();
      expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('20');
    },
  );

  it('shows the low tone and a cover fallback without sales history', () => {
    render(<TankGauge name="Tank 1" level={level(6_000)} coverFallback="no cover yet" />);
    expect(screen.getByText('6,000 L').className).toContain('text-warning-fg');
    expect(screen.getByText('no cover yet')).toBeTruthy();
  });

  it('flags over-capacity book stock and a pending decantation', () => {
    render(<TankGauge name="Tank 1" level={level(23_000, { waitingOnDecantation: true })} />);
    expect(screen.getByText('of 20,000 L · 115%')).toBeTruthy();
    expect(screen.getByText('Over capacity')).toBeTruthy();
    expect(screen.getByText('Waiting on decantation')).toBeTruthy();
  });

  it('can leave the status lines to the caller', () => {
    render(
      <TankGauge
        name="Tank 1"
        level={level(23_000, { waitingOnDecantation: true })}
        showStatus={false}
      />,
    );
    expect(screen.queryByText('Waiting on decantation')).toBeNull();
  });

  it('keeps the Dashboard size by default and grows the tube at lg (#536)', () => {
    const { container, rerender } = render(<TankGauge name="Tank 1" level={level(4_000)} />);
    const root = () => container.firstElementChild as HTMLElement;
    expect(root().dataset.size).toBe('md');
    expect(screen.getByRole('meter').className).toContain('h-[30px]');
    rerender(<TankGauge name="Tank 1" level={level(4_000)} size="lg" />);
    expect(root().dataset.size).toBe('lg');
    expect(screen.getByRole('meter').className).toContain('h-[64px]');
    // Same tone and words at either size.
    expect(root().dataset.tone).toBe('critical');
    expect(screen.getByText('4,000 L').className).toContain('text-danger-fg');
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('keeps an ordinary tank plain: colour only for low or critical', () => {
    render(<TankGauge name="Tank 1" level={level(13_000)} />);
    const head = screen.getByText('13,000 L').className;
    expect(head).toContain('text-ink-strong');
    expect(head).not.toContain('success');
  });

  it('shows a dash for a tank with no capacity', () => {
    render(
      <TankGauge
        name="Tank 1"
        level={deriveTankLevel({ capacity: 0, currentVolume: 10 }, DEFAULT_TANK_LEVEL_SETTINGS)}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('TankGauge tube layout (#609)', () => {
  it('puts name and cover on the left, stock and capacity right-aligned on the right', () => {
    const { container } = render(
      <TankGauge name="Tank 1" level={level(13_000, { daysOfCover: 10.7 })} />,
    );
    const [left, right] = Array.from(
      container.firstElementChild!.querySelectorAll(':scope > div'),
    ) as HTMLElement[];
    expect(left.textContent).toContain('Tank 1');
    expect(left.textContent).toContain('10.7 days cover');
    expect(right.className).toContain('text-right');
    expect(right.textContent).toContain('13,000 L');
    expect(right.textContent).toContain('of 20,000 L');
  });
});
