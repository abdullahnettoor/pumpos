// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Role, Station } from '@pump/shared';

/**
 * What Home shows per Role: the owner's overview, or for a Manager, Accountant
 * or Staff member who man a pump just their handover card (they have no Home
 * overview, but Home is where the card lives).
 */
const mine = vi.hoisted(() => ({ assignment: null as unknown }));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useMyAssignment: () => ({ data: mine.assignment }) };
});
vi.mock('../lib/alerts.js', () => ({ useMobileAlerts: () => [] }));
vi.mock('../screens/HomeScreen.js', () => ({ HomeScreen: () => <p>owner overview</p> }));

const { TabRoot } = await import('./TabRoot.js');
const { ShellContext } = await import('./context.js');
const { NavProvider } = await import('./nav.js');

const station = { id: 'st-1', name: 'Highway Fuels', settings: {} } as unknown as Station;
const assigned = {
  shift: { id: 's2', templateName: 'Shift 2' },
  dispenserUnits: [{ duId: 'du-2', duName: 'DU2', nozzles: [], terminals: [] }],
};

const renderHome = (role: Role) =>
  render(
    <ShellContext.Provider
      value={{ station, stationName: station.name, userName: 'A B', role, openAccount: () => {} }}
    >
      <NavProvider tabs={['home']}>
        <TabRoot tab="home" station={station} stationsLoading={false} />
      </NavProvider>
    </ShellContext.Provider>,
  );

afterEach(() => {
  cleanup();
  mine.assignment = null;
});

describe('Home root per Role', () => {
  it('an Owner gets the overview', () => {
    renderHome('Owner');
    expect(screen.getByText('owner overview')).toBeTruthy();
  });

  it('a Manager on a Dispenser Unit gets the handover card and no owner overview', () => {
    mine.assignment = assigned;
    renderHome('Manager');
    expect(screen.getByRole('button', { name: /Your handover · DU2/ })).toBeTruthy();
    expect(screen.queryByText('owner overview')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Alerts/ })).toBeNull();
  });
});
