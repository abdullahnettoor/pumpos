// @vitest-environment jsdom
import React, { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Role, Station } from '@pump/shared';

/**
 * What Home shows per Role: the full overview for an Owner and a Manager (with
 * the pinned handover card when they man a pump), or for an Accountant or Staff
 * member who mans a pump just their handover card (they have no Home overview,
 * but Home is where the card lives).
 */
const mine = vi.hoisted(() => ({ assignment: null as unknown }));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useMyAssignment: () => ({ data: mine.assignment }) };
});
const feed = vi.hoisted(() => ({
  alerts: [] as { id: string; severity: 'warning'; category: 'stock'; title: string }[],
}));
vi.mock('../lib/alerts.js', () => ({ useMobileAlerts: () => feed.alerts }));
vi.mock('../screens/HomeScreen.js', () => ({ HomeScreen: () => <p>owner overview</p> }));
vi.mock('../screens/ShiftsScreen.js', () => ({ ShiftsScreen: () => <p>shifts list</p> }));
vi.mock('../screens/ReportsScreen.js', () => ({ ReportsScreen: () => <p>reports list</p> }));
vi.mock('../screens/MoneyScreen.js', () => ({ MoneyScreen: () => <p>money list</p> }));

const { TabRoot } = await import('./TabRoot.js');
const { ShellContext } = await import('./context.js');
const { NavProvider, useNav } = await import('./nav.js');

const station = { id: 'st-1', name: 'Highway Fuels', settings: {} } as unknown as Station;
const assigned = {
  shift: { id: 's2', templateName: 'Shift 2' },
  dispenserUnits: [{ duId: 'du-2', duName: 'DU2', nozzles: [], terminals: [] }],
};

const seen = { depth: 0 };
const DepthProbe: React.FC = () => {
  const { depth } = useNav();
  useLayoutEffect(() => {
    seen.depth = depth;
  });
  return null;
};

const renderTab = (role: Role, tab: 'home' | 'shifts' | 'reports' | 'money' = 'home') =>
  render(
    <ShellContext.Provider
      value={{ station, stationName: station.name, userName: 'A B', role, openAccount: () => {} }}
    >
      <NavProvider tabs={[tab]}>
        <DepthProbe />
        <TabRoot tab={tab} station={station} stationsLoading={false} />
      </NavProvider>
    </ShellContext.Provider>,
  );

afterEach(() => {
  cleanup();
  mine.assignment = null;
  feed.alerts = [];
});

describe('Home root per Role', () => {
  it('an Owner gets the overview', () => {
    renderTab('Owner');
    expect(screen.getByText('owner overview')).toBeTruthy();
  });

  it('a Manager gets the same overview and header as an Owner', () => {
    feed.alerts = [{ id: 'a1', severity: 'warning', category: 'stock', title: 'Tank 2 low' }];
    renderTab('Manager');
    expect(screen.getByText('owner overview')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alerts, 1 open' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Highway Fuels, open account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
  });

  it('a Manager on a Dispenser Unit gets the full Home, not the card-only Home', () => {
    mine.assignment = assigned;
    renderTab('Manager');
    expect(screen.getByText('owner overview')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Needs attention' })).toBeNull();
  });

  it('the bell pushes the Needs attention page on Home', () => {
    feed.alerts = [{ id: 'a1', severity: 'warning', category: 'stock', title: 'Tank 2 low' }];
    renderTab('Manager');
    fireEvent.click(screen.getByRole('button', { name: 'Alerts, 1 open' }));
    expect(seen.depth).toBe(1);
  });

  it('an Accountant or Staff member who cannot see alerts gets the card only, no overview or bell', () => {
    mine.assignment = assigned;
    feed.alerts = [{ id: 'a1', severity: 'warning', category: 'stock', title: 'Tank 2 low' }];
    for (const role of ['Accountant', 'Staff'] as Role[]) {
      renderTab(role);
      expect(screen.getByRole('button', { name: /Your handover · DU2/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Alerts/ })).toBeNull();
      expect(screen.queryByText('Tank 2 low')).toBeNull();
      expect(screen.queryByText('owner overview')).toBeNull();
      cleanup();
    }
  });
});

describe('the alerts bell on tab headers', () => {
  const stockAlert = {
    id: 'a1',
    severity: 'warning' as const,
    category: 'stock' as const,
    title: 'Tank 2 low',
  };

  it('a Manager reaches Needs attention from the Shifts tab', () => {
    feed.alerts = [stockAlert];
    renderTab('Manager', 'shifts');
    expect(screen.getByText('shifts list')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Alerts, 1 open' }));
    expect(seen.depth).toBe(1);
  });

  it('every tab of an alert-seeing Role carries the bell', () => {
    feed.alerts = [stockAlert];
    for (const tab of ['reports', 'money'] as const) {
      renderTab('Manager', tab);
      expect(screen.getByRole('button', { name: 'Alerts, 1 open' })).toBeTruthy();
      cleanup();
    }
  });

  it('a Role that may not see alerts (Accountant) has no bell on its tabs', () => {
    feed.alerts = [stockAlert];
    for (const tab of ['reports', 'money'] as const) {
      renderTab('Accountant', tab);
      expect(screen.queryByRole('button', { name: /^Alerts/ })).toBeNull();
      cleanup();
    }
  });
});
