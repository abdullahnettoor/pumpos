/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { publishNavIntent, __resetNavIntentForTests } from '../nav-intent/store.js';
import { renderWithProviders } from '../test/renderWithProviders.js';

vi.mock('../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDailyDssrRange: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCapability: () => ({ status: 'enabled' }),
}));

const { ReportsOverview } = await import('./ReportsOverview.js');

afterEach(() => {
  cleanup();
  __resetNavIntentForTests();
});

const station = { id: 'st-1', name: 'Station', settings: {} };

const navText = () => screen.getByRole('navigation', { name: 'Reports' }).textContent!;
const item = (name: string | RegExp) => screen.queryByRole('button', { name });

describe('Reports sub-navigation (#540)', () => {
  it('groups the reports for an Owner: Sales · Finance · Tax & registers', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(navText()).toBe(
      [
        'Sales',
        'DSSR',
        'Attendant handovers',
        'Decantations',
        'Finance',
        'Profit & loss',
        'Ledgers',
        'Invoices',
        'Tax & registers',
        'GST',
        'Expense register',
      ].join(''),
    );
  });

  it('opens on the DSSR', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(item('DSSR')!.getAttribute('aria-current')).toBe('page');
  });

  it('no longer lists the Daily cash book, Templates or Cash & bank', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(navText()).not.toMatch(/cash book|Templates|Cash & bank|Tax register/i);
  });

  it.each(['Manager', 'Accountant'] as const)('hides Profit & loss from %s', (role) => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole={role} />);
    expect(item('Profit & loss')).toBeNull();
    expect(item('Ledgers')).toBeTruthy();
  });

  it('GST is one report with Sales · Purchases (ITC) · Income views', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('GST')!);
    const views = screen.getByRole('radiogroup', { name: 'GST view' });
    expect(views.textContent).toBe('SalesPurchases (ITC)Income');
  });

  it('a GST deep link opens the requested view', () => {
    act(() => publishNavIntent({ openReportsTab: 'gst', openGstView: 'income' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(item('GST')!.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('radio', { name: 'Income' }).getAttribute('aria-checked')).toBe('true');
  });

  it('switching view after a GST deep link stays on GST (review #545)', () => {
    act(() => publishNavIntent({ openReportsTab: 'gst', openGstView: 'purchases' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(item('GST')!.getAttribute('aria-current')).toBe('page');
    expect(item('DSSR')!.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Income' }).getAttribute('aria-checked')).toBe('true');
  });

  it('GST views share one period', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('GST')!);
    fireEvent.click(screen.getByRole('radio', { name: 'Purchases (ITC)' }));
    const firstDate = () => document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(firstDate(), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Purchases (ITC)' }));
    expect(firstDate().value).toBe('2026-01-01');
  });

  it('Ledgers holds the party ledger and cash & bank', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('Ledgers')!);
    expect(screen.getByRole('radiogroup', { name: 'Ledger view' }).textContent).toBe(
      'PartyCash & bank',
    );
  });
});

describe('Reports → Decantations (#473)', () => {
  it.each(['Owner', 'Manager', 'Accountant'] as const)('is shown to %s', (role) => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole={role} />);
    expect(item(/Decantations/)).toBeTruthy();
  });

  it('is hidden from Staff', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Staff" />);
    expect(item(/Decantations/)).toBeNull();
  });
});
