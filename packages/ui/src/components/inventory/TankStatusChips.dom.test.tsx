// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TANK_LEVEL_SETTINGS } from '@pump/shared';
import { TankStatusChips } from './TankStatusChips.js';

describe('TankStatusChips', () => {
  afterEach(cleanup);

  it('shows the pending Decantation state without hiding low stock', () => {
    render(
      <TankStatusChips
        tank={{ capacity: 20_000, currentVolume: 2_000, waitingOnDecantation: true }}
        tankLevels={DEFAULT_TANK_LEVEL_SETTINGS}
      />,
    );

    expect(screen.getByText('Waiting on decantation')).toBeTruthy();
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('follows the station tank levels (#520)', () => {
    render(
      <TankStatusChips
        tank={{ capacity: 20_000, currentVolume: 2_000 }}
        tankLevels={{ criticalBelowPct: 5, lowBelowPct: 8 }}
      />,
    );

    expect(screen.getByText('OK')).toBeTruthy();
  });
});
