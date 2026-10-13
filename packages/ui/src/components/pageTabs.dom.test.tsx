/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders.js';
import { publishNavIntent, __resetNavIntentForTests } from '../nav-intent/store.js';
import { CustomersList } from './CustomersList.js';
import { PurchasesList } from './PurchasesList.js';
import { AccountsPanel } from './finance/AccountsPanel.js';
import { ExpensesList } from './ExpensesList.js';
import { IncomeList } from './IncomeList.js';
import { InventoryList } from './InventoryList.js';
import { FuelPricingPanel } from './StationSetup/FuelPricingPanel.js';
import { StationOverview } from './StationSetup/StationOverview.js';
import { OrganizationOverview } from './Organization/OrganizationOverview.js';

/**
 * Page structure (#540): each page's tabs, in order, with its main list first
 * and selected on arrival; every tab carries an icon. The API answers empty.
 */
vi.mock('../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCapability: () => ({ status: 'enabled' }),
}));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetNavIntentForTests();
});

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  code: 'HF',
  onboardingStatus: 'READY_FOR_OPERATIONS',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

async function tabsOf(label: string) {
  const list = await screen.findByRole('tablist', { name: label });
  const tabs = within(list).getAllByRole('tab');
  return {
    labels: tabs.map((t) => t.querySelector('.pump-tab__label')?.textContent),
    selected: tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.textContent,
    allHaveIcons: tabs.every((t) => t.querySelector('.pump-tab__icon svg')),
  };
}

const cases: [string, string, () => React.ReactElement, string[]][] = [
  [
    'Customers',
    'Customers',
    () => <CustomersList selectedStation={station} userRole="Owner" />,
    ['Customers', 'Credit sales', 'Collections', 'Vehicles'],
  ],
  [
    'Suppliers',
    'Suppliers',
    () => <PurchasesList selectedStation={station} />,
    ['Suppliers', 'Purchases'],
  ],
  [
    'Accounts',
    'Accounts',
    () => <AccountsPanel selectedStation={station} />,
    ['Accounts', 'Daily cash book'],
  ],
  [
    'Expenses',
    'Expense views',
    () => <ExpensesList selectedStation={station} userRole="Owner" />,
    ['Expenses', 'By category'],
  ],
  [
    'Income',
    'Income',
    () => <IncomeList selectedStation={station} userRole="Owner" />,
    ['Income', 'By category'],
  ],
  [
    'Inventory',
    'Inventory views',
    () => <InventoryList selectedStation={station} userRole="Owner" />,
    ['Tanks', 'Decantations', 'Density', 'Product stock', 'Movements', 'Reconciliations'],
  ],
  [
    'Pricing',
    'Pricing views',
    () => <FuelPricingPanel selectedStation={station} />,
    ['Fuels', 'Products'],
  ],
  [
    'Station',
    'Station setup',
    () => (
      <StationOverview selectedStation={station} userRole="Owner" onStationSelected={() => {}} />
    ),
    [
      'General',
      'Branding',
      'Products',
      'Tanks',
      'Dispensers',
      'Payment terminals',
      'Shift templates',
      'Rules',
      'Report templates',
    ],
  ],
  [
    'Organization',
    'Organization',
    () => (
      <OrganizationOverview
        stations={[station]}
        selectedStation={station}
        onStationChange={() => {}}
        onNavigate={() => {}}
      />
    ),
    ['Stations', 'Team', 'Activity', 'Profile', 'Desktop app'],
  ],
];

describe('page tabs (#540)', () => {
  it.each(cases)(
    '%s: tabs in order, main list first and selected, all with icons',
    async (_page, label, ui, expected) => {
      renderWithProviders(ui());
      const t = await tabsOf(label);
      expect(t.labels).toEqual(expected);
      expect(t.selected).toContain(expected[0]);
      expect(t.allHaveIcons).toBeTruthy();
    },
  );

  it('Accounts: the Cash Book deep link opens the Daily cash book', async () => {
    act(() => publishNavIntent({ openAccountsTab: 'cash-book' }));
    renderWithProviders(<AccountsPanel selectedStation={station} />);
    expect((await tabsOf('Accounts')).selected).toContain('Daily cash book');
  });

  it('Accounts: the Daily cash book shows no account actions', async () => {
    renderWithProviders(<AccountsPanel selectedStation={station} />);
    expect(await screen.findByRole('button', { name: /New Account/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Daily cash book/ }));
    expect(screen.queryByRole('button', { name: /New Account/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Transfer/ })).toBeNull();
  });

  it('Suppliers: the new-purchase deep link opens on Purchases', async () => {
    act(() => publishNavIntent({ openNewPurchase: true }));
    renderWithProviders(<PurchasesList selectedStation={station} />);
    expect((await tabsOf('Suppliers')).selected).toContain('Purchases');
  });

  it('Customers: a statement deep link (⌘K) opens on the customer list', async () => {
    act(() => publishNavIntent({ focusCustomerId: 'c1', open: 'customer-statement' }));
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    expect((await tabsOf('Customers')).selected).toContain('Customers');
  });

  it('Suppliers: closing the new-purchase drawer stays on Purchases (review #545)', async () => {
    act(() => publishNavIntent({ openNewPurchase: true }));
    renderWithProviders(<PurchasesList selectedStation={station} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close Drawer' }));
    expect(screen.queryByRole('button', { name: 'Close Drawer' })).toBeNull();
    expect((await tabsOf('Suppliers')).selected).toContain('Purchases');
  });

  it('Customers: dropping a focus deep link stays on the customer list', async () => {
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Collections/ }));
    act(() => publishNavIntent({ focusCustomerId: 'c1', open: 'customer-statement' }));
    expect((await tabsOf('Customers')).selected).toContain('Customers');
    // An action that drops the intent commits its derived tab first.
    fireEvent.click(screen.getByRole('button', { name: /Add Customer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close Drawer' }));
    expect((await tabsOf('Customers')).selected).toContain('Customers');
  });
});

describe('Income GST by role (review #545: #540 keeps role filtering unchanged)', () => {
  it('Staff, who have no Reports, see Income GST in place on a GST tab', async () => {
    renderWithProviders(
      <IncomeList selectedStation={station} userRole="Staff" onNavigate={() => {}} />,
    );
    const t = await tabsOf('Income');
    expect(t.labels).toEqual(['Income', 'By category', 'GST']);
    expect(screen.queryByRole('button', { name: /GST in Reports/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /GST/ }));
    expect(await screen.findByText(/Output GST you collected on other income/)).toBeTruthy();
  });

  it.each(['Owner', 'Manager', 'Accountant'] as const)(
    '%s keeps the link to Reports → GST instead',
    async (role) => {
      const onNavigate = vi.fn();
      renderWithProviders(
        <IncomeList selectedStation={station} userRole={role} onNavigate={onNavigate} />,
      );
      expect((await tabsOf('Income')).labels).toEqual(['Income', 'By category']);
      fireEvent.click(screen.getByRole('button', { name: /GST in Reports/ }));
      expect(onNavigate).toHaveBeenCalledWith('/reports', {
        openReportsTab: 'gst',
        openGstView: 'income',
      });
    },
  );
});
