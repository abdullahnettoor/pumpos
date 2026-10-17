// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TANK_LEVEL_SETTINGS, deriveTankLevel, tankStates } from '@pump/shared';
import { TankStatusChips } from './TankStatusChips.js';

const states = (
  row: { capacity: number; currentVolume: number; waitingOnDecantation?: boolean },
  levels = DEFAULT_TANK_LEVEL_SETTINGS,
) => tankStates(deriveTankLevel(row, levels));

describe('TankStatusChips', () => {
  afterEach(cleanup);

  it('shows the pending Decantation state without hiding low stock', () => {
    render(
      <TankStatusChips
        states={states({ capacity: 20_000, currentVolume: 2_000, waitingOnDecantation: true })}
      />,
    );

    expect(screen.getByText('Waiting on decantation')).toBeTruthy();
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('follows the station tank levels (#520) and says nothing for an ordinary tank', () => {
    const { container } = render(
      <TankStatusChips
        states={states(
          { capacity: 20_000, currentVolume: 2_000 },
          { criticalBelowPct: 5, lowBelowPct: 8 },
        )}
      />,
    );

    expect(container.textContent).toBe('');
  });

  it('shows book stock over capacity as a state (#536)', () => {
    render(<TankStatusChips states={states({ capacity: 20_000, currentVolume: 23_000 })} />);
    expect(screen.getByText('Over capacity')).toBeTruthy();
  });
});
