// @vitest-environment jsdom
import React, { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Station } from '@pump/shared';
import type { MobileAlert } from '../lib/alerts.js';
import type { TabKey } from '../lib/tabKey.js';

/**
 * The Needs attention page: grouped by kind, a row per alert, each opening the
 * one page that explains it, and the same count as the bell and Home's "All N".
 * The linked pages are stand-ins (they have their own tests).
 */
const feed = vi.hoisted(() => ({ alerts: [] as unknown[] }));
vi.mock('../lib/alerts.js', () => ({ useMobileAlerts: () => feed.alerts }));
vi.mock('./reports/ReportDayPage.js', () => ({
  ReportDayPage: (p: { businessDate: string }) => <p>DSSR page {p.businessDate}</p>,
}));
vi.mock('./ShiftSummaryPage.js', () => ({
  ShiftSummaryPage: (p: { shiftId: string }) => <p>Shift summary page {p.shiftId}</p>,
}));
vi.mock('./money/CustomerPage.js', () => ({
  CustomerPage: (p: { customer: { name: string } }) => <p>Customer page {p.customer.name}</p>,
}));
vi.mock('./HandoverPage.js', () => ({ HandoverPage: () => <p>Handover page</p> }));

const { HomeAttention } = await import('./home/HomeAttention.js');
const { HomeHeader } = await import('../shell/HomeHeader.js');
const { ShellContext } = await import('../shell/context.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { stackOf } = await import('../shell/navStack.js');

const station = { id: 'st-1', name: 'Highway Fuels', settings: {} } as unknown as Station;

const stock: MobileAlert = {
  id: 'tank-1',
  severity: 'danger',
  category: 'stock',
  title: 'HSD critically low',
  meta: 'HSD · 8% · 3,600 L',
};
const day: MobileAlert = {
  id: 'day-2026-10-08',
  severity: 'warning',
  category: 'day',
  title: 'Thu, 8 Oct not closed',
  meta: 'DSSR is a draft until the day is closed',
  action: { kind: 'day', businessDate: '2026-10-08' },
};
const credit: MobileAlert = {
  id: 'credit-c1',
  severity: 'danger',
  category: 'credit',
  title: 'KTC Logistics over credit limit',
  meta: '₹2,15,000 of ₹2,00,000',
  action: { kind: 'credit', customer: { id: 'c1', name: 'KTC Logistics' } },
};
const variance: MobileAlert = {
  id: 'var-s1',
  severity: 'danger',
  category: 'variance',
  title: 'Shift 1 short by ₹340',
  meta: 'DU3 short · Fri, 9 Oct',
  action: { kind: 'variance', shiftId: 's1' },
};
const handover: MobileAlert = {
  id: 'handover-own',
  severity: 'warning',
  category: 'handover',
  title: 'Your handover is not saved',
  meta: 'Shift 2 · DU2',
  action: { kind: 'handover' },
};
const all = [stock, credit, variance, day, handover];

const holder = { nav: null as unknown as ReturnType<typeof useNav> };
const Probe: React.FC = () => {
  const n = useNav();
  useLayoutEffect(() => {
    holder.nav = n;
  });
  return null;
};

/** Home's root plus whatever page is on top of its stack (the shell does this with Panes). */
const Stage: React.FC = () => {
  const n = useNav();
  const stack = stackOf({ active: n.active, stacks: n.stacks, visited: [...n.visited] }, 'home');
  const top = stack[stack.length - 1];
  return top ? (
    <>{top.element}</>
  ) : (
    <>
      <HomeHeader />
      <HomeAttention alerts={feed.alerts as MobileAlert[]} station={station} />
    </>
  );
};

const mount = (tabs: TabKey[] = ['home', 'reports', 'money', 'shifts']) =>
  render(
    <ShellContext.Provider
      value={{
        station,
        stationName: station.name,
        userName: 'A B',
        role: 'Owner',
        openAccount: () => {},
      }}
    >
      <NavProvider tabs={tabs}>
        <Probe />
        <Stage />
      </NavProvider>
    </ShellContext.Provider>,
  );

const openPage = () => fireEvent.click(screen.getByRole('button', { name: /^Alerts/ }));
const group = (name: RegExp) => screen.getByRole('region', { name });

afterEach(() => {
  cleanup();
  feed.alerts = [];
});

describe('Needs attention page', () => {
  it('groups alerts by kind in order, with the open count', () => {
    feed.alerts = all;
    mount();
    openPage();
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(regions).toEqual([
      'Stock, 1 alert',
      'Day close, 1 alert',
      'Credit, 1 alert',
      'Cash variance, 1 alert',
      'Handover, 1 alert',
    ]);
    expect(screen.getByText('5 open')).toBeTruthy();
    expect(within(group(/^Stock/)).getByText('HSD critically low')).toBeTruthy();
    expect(within(group(/^Credit/)).getByText('₹2,15,000 of ₹2,00,000')).toBeTruthy();
  });

  it('skips kinds with nothing in them and keeps list order inside a kind', () => {
    feed.alerts = [
      { ...day, id: 'day-2026-10-08' },
      { ...day, id: 'day-2026-10-07', title: 'Wed, 7 Oct not closed' },
    ];
    mount();
    openPage();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Day close, 2 alerts',
    ]);
    const rows = within(group(/^Day close/)).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Thu, 8 Oct'),
      expect.stringContaining('Wed, 7 Oct'),
    ]);
  });

  it('says so when nothing needs attention', () => {
    mount();
    openPage();
    expect(screen.getByText('Nothing needs attention')).toBeTruthy();
    expect(screen.queryByText(/open$/)).toBeNull();
  });

  it('shows the same count on the bell, Home "All N" and the page', () => {
    feed.alerts = all;
    mount();
    expect(screen.getByRole('button', { name: 'Alerts, 5 open' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All 5 alerts' })).toBeTruthy();
    openPage();
    const listed = screen.getAllByRole('listitem').length;
    expect(listed).toBe(5);
    expect(screen.getByText('5 open')).toBeTruthy();
  });

  it('opens from "All N" as a page on Home', () => {
    feed.alerts = all;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'All 5 alerts' }));
    expect(holder.nav.active).toBe('home');
    expect(holder.nav.depth).toBe(1);
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy();
  });

  describe('actions', () => {
    const tapAlert = (title: RegExp) => {
      feed.alerts = all;
      mount();
      openPage();
      fireEvent.click(screen.getByRole('button', { name: title }));
    };

    it("a day alert opens that day's DSSR", () => {
      tapAlert(/Thu, 8 Oct not closed/);
      expect(screen.getByText('DSSR page 2026-10-08')).toBeTruthy();
    });

    it('a credit alert opens the Customer page', () => {
      tapAlert(/KTC Logistics over credit limit/);
      expect(screen.getByText('Customer page KTC Logistics')).toBeTruthy();
    });

    it('a variance alert opens the Shift Summary', () => {
      tapAlert(/Shift 1 short/);
      expect(screen.getByText('Shift summary page s1')).toBeTruthy();
    });

    it('the handover alert opens the handover page', () => {
      tapAlert(/Your handover is not saved/);
      expect(screen.getByText('Handover page')).toBeTruthy();
    });

    it('a stock alert has no action', () => {
      feed.alerts = all;
      mount();
      openPage();
      expect(screen.queryByRole('button', { name: /HSD critically low/ })).toBeNull();
      expect(screen.getByText('HSD critically low')).toBeTruthy();
    });

    it('offers no action for a page the Role has no tab for', () => {
      feed.alerts = all;
      mount(['home']);
      openPage();
      expect(screen.queryByRole('button', { name: /Thu, 8 Oct/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /KTC Logistics/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Shift 1 short/ })).toBeNull();
      // The title still reads; the own handover needs no tab.
      expect(screen.getByText('Thu, 8 Oct not closed')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Your handover is not saved/ })).toBeTruthy();
    });
  });
});
