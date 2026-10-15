// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TANK_LEVEL_SETTINGS, deriveTankLevel } from '@pump/shared';
import { TankGauge } from './TankGauge.js';
import { stockOfCapacity } from './stockOfCapacity.js';

afterEach(cleanup);

const level = (currentVolume: number, extra: Record<string, unknown> = {}) =>
  deriveTankLevel({ capacity: 20_000, currentVolume, ...extra }, DEFAULT_TANK_LEVEL_SETTINGS);

describe('stockOfCapacity', () => {
  it('reads litres as KL', () => {
    expect(stockOfCapacity(12_400, 20_000)).toBe('12.4 of 20 KL');
    expect(stockOfCapacity(12_400, 12_500, 'L')).toBe('12.4 of 12.5 KL');
  });

  it('keeps other units whole', () => {
    expect(stockOfCapacity(1_200, 2_000, 'kg')).toBe('1,200 of 2,000 kg');
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
      expect(screen.getByText('20%').className).toContain('text-danger-fg');
      expect(screen.getByText('4.0 of 20 KL')).toBeTruthy();
      expect(root.textContent).toContain('2.6 days cover');
      expect(screen.getByText('Critical')).toBeTruthy();
      expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('20');
    },
  );

  it('shows the low tone and a cover fallback without sales history', () => {
    render(<TankGauge name="Tank 1" level={level(6_000)} coverFallback="no cover yet" />);
    expect(screen.getByText('30%').className).toContain('text-warning-fg');
    expect(screen.getByText('no cover yet')).toBeTruthy();
  });

  it('flags over-capacity book stock and a pending decantation', () => {
    render(<TankGauge name="Tank 1" level={level(23_000, { waitingOnDecantation: true })} />);
    expect(screen.getByText('115%')).toBeTruthy();
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
    expect(screen.getByText('20%').className).toContain('text-danger-fg');
    expect(screen.getByText('Critical')).toBeTruthy();
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
