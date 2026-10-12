// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './primitives/ToastProvider.js';
import { AppShell, SIDEBAR_COLLAPSED_KEY, type NavItem } from './AppShell.js';
import type { SidebarBadges } from '../query/useSidebarBadges.js';

let mockBadges: SidebarBadges = {
  shiftRunning: false,
  inventoryAlerts: 0,
  overdueCustomers: 0,
  openPastDays: 0,
};
vi.mock('../query/useSidebarBadges.js', async (orig) => ({
  ...(await orig<typeof import('../query/useSidebarBadges.js')>()),
  useSidebarBadges: () => mockBadges,
}));

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
  window.innerWidth = 1440;
  mockBadges = { shiftRunning: false, inventoryAlerts: 0, overdueCustomers: 0, openPastDays: 0 };
});

afterEach(cleanup);

const mockNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Shifts', path: '/shifts' },
  { label: 'Station Overview', path: '/setup/station' },
  { label: 'Expenses', path: '/expenses' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Customers', path: '/customers' },
  { label: 'Custom Nav', path: '/custom', icon: 'zap' },
];

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
};

describe('AppShell navigation and icons', () => {
  it('renders navigation links with Icon primitives and correct stroke/dimensions', () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        currentPath="/dashboard"
        onNavigate={onNavigate}
        userRole="Owner"
        userName="Admin User"
        syncStatus="synced"
        onLogout={() => {}}
      >
        <div>Content Body</div>
      </AppShell>,
    );

    // Verify main content rendered
    expect(screen.getByText('Content Body')).not.toBeNull();

    // Verify nav links have rendered icons with standard pump-ds size-[18px]
    const navButtons = screen.getAllByRole('button');
    const dashboardBtn = navButtons.find((btn) => btn.textContent?.includes('Dashboard'));
    expect(dashboardBtn).toBeDefined();

    const svg = dashboardBtn?.querySelector('svg');
    expect(svg).not.toBeNull();
    // Verify standard Icon attributes
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.classList.contains('size-[18px]')).toBe(true);
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');

    // Verify custom icon override
    const customBtn = navButtons.find((btn) => btn.textContent?.includes('Custom Nav'));
    expect(customBtn).toBeDefined();
    const customSvg = customBtn?.querySelector('svg');
    expect(customSvg).not.toBeNull();
    expect(customSvg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('handles navigation click and collapse toggle', () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        currentPath="/dashboard"
        onNavigate={onNavigate}
        userRole="Owner"
        userName="Admin User"
        syncStatus="synced"
        onLogout={() => {}}
      >
        <div>Content Body</div>
      </AppShell>,
    );

    const shiftsBtn = screen.getByText('Shifts').closest('button');
    expect(shiftsBtn).not.toBeNull();
    fireEvent.click(shiftsBtn!);
    expect(onNavigate).toHaveBeenCalledWith('/shifts');

    // Collapse via the control at the sidebar foot
    const toggleBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn);

    // When collapsed, title attribute holds the label and text span is not rendered
    expect(screen.queryByText('Shifts')).toBeNull();
    const collapsedBtn = screen.getByTitle('Shifts');
    expect(collapsedBtn).not.toBeNull();
  });

  it('renders top bar header action icons with Icon primitives', () => {
    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        currentPath="/dashboard"
        onNavigate={() => {}}
        userRole="Owner"
        userName="Admin User"
        syncStatus="synced"
        onLogout={() => {}}
        stationReady={true}
      >
        <div>Content Body</div>
      </AppShell>,
    );

    // Sidebar collapse control icon
    const toggleBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    const toggleSvg = toggleBtn.querySelector('svg');
    expect(toggleSvg?.getAttribute('aria-hidden')).toBe('true');
    expect(toggleSvg?.classList.contains('size-[18px]')).toBe(true);

    // Notifications button icon
    const notifBtn = screen.getByRole('button', { name: /notifications/i });
    const notifSvg = notifBtn.querySelector('svg');
    expect(notifSvg?.getAttribute('aria-hidden')).toBe('true');
    expect(notifSvg?.classList.contains('size-[18px]')).toBe(true);
  });
});

const station = (id: string, name: string) => ({ id, name }) as any;

const shell = (props: Partial<React.ComponentProps<typeof AppShell>> = {}) =>
  renderWithProviders(
    <AppShell
      navItems={[
        ...mockNavItems,
        { label: 'Purchases', path: '/purchases' },
        { label: 'Inventory', path: '/inventory' },
        { label: 'Reports', path: '/reports', roles: ['Owner'] },
        { label: 'Organization', path: '/organization', roles: ['Owner'] },
      ]}
      currentPath="/shifts"
      onNavigate={() => {}}
      userRole="Owner"
      userName="Admin User"
      syncStatus="synced"
      onLogout={() => {}}
      {...props}
    >
      <div>Body</div>
    </AppShell>,
  );

describe('AppShell sidebar groups', () => {
  it('groups Operate / Money / Insight / Setup and filters by role', () => {
    shell({ userRole: 'Manager' });
    const text = document.querySelector('nav.flex-1')!.textContent!;
    expect(text).toMatch(/Operate.*Dashboard.*Shifts.*Pricing/);
    expect(text).toMatch(/Money.*Customers.*Purchases.*Expenses/);
    expect(text).toMatch(/Setup.*Station Overview/);
    expect(text).not.toContain('Insight');
    expect(text).not.toContain('Reports');
    expect(text).not.toContain('Organization');
  });

  it('shows Insight and Organization to an Owner', () => {
    shell();
    const text = document.querySelector('nav.flex-1')!.textContent!;
    expect(text).toMatch(/Insight.*Reports/);
    expect(text).toMatch(/Setup.*Station Overview.*Organization/);
  });

  it('shows the breadcrumb page label', () => {
    shell({ selectedStation: station('s1', 'Indiranagar HP') });
    expect(screen.getByTestId('topbar-page').textContent).toBe('Shifts');
  });
});

describe('AppShell badges', () => {
  it('renders live badges on their items', () => {
    mockBadges = { shiftRunning: true, inventoryAlerts: 3, overdueCustomers: 2, openPastDays: 1 };
    shell({ userRole: 'Owner' });
    expect(screen.getByLabelText('Shift running')).not.toBeNull();
    expect(screen.getByLabelText('3 inventory alerts').textContent).toBe('3');
    expect(screen.getByLabelText('2 overdue customers').textContent).toBe('2');
    expect(screen.getByLabelText('1 open past days').textContent).toBe('1');
  });

  it('renders none when there is nothing to flag', () => {
    shell();
    expect(screen.queryByLabelText(/inventory alerts|overdue|open past/)).toBeNull();
  });
});

describe('AppShell collapse', () => {
  it('remembers the collapsed state per device', () => {
    const first = shell();
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    first.unmount();
    shell();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).not.toBeNull();
  });

  it('becomes a 60px rail below 1200px and keeps the saved choice', () => {
    window.innerWidth = 1100;
    shell();
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside.style.width).toBe('60px');
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
    window.innerWidth = 1400;
    fireEvent(window, new Event('resize'));
    expect(aside.style.width).toBe('220px');
  });
});

describe('AppShell station switcher', () => {
  const two = [station('s1', 'Indiranagar HP'), station('s2', 'Whitefield')];

  it('is a dropdown when more than one station is reachable', () => {
    shell({ stations: two, selectedStation: two[0], onStationChange: () => {} });
    expect(screen.getByTestId('topbar-station').tagName).toBe('BUTTON');
  });

  it('is plain text for one station', () => {
    shell({ stations: [two[0]], selectedStation: two[0], onStationChange: () => {} });
    expect(screen.getByTestId('topbar-station').tagName).toBe('SPAN');
  });

  it('lists only the assigned stations for a manager', () => {
    const three = [...two, station('s3', 'Hebbal')];
    // API-filtered list already holds just the assigned two.
    shell({
      userRole: 'Manager',
      stations: three.slice(0, 2),
      selectedStation: three[0],
      onStationChange: () => {},
    });
    expect(screen.getByTestId('topbar-station').tagName).toBe('BUTTON');
  });

  it('is plain text for a manager with one assigned station', () => {
    shell({
      userRole: 'Manager',
      stations: [two[0]],
      selectedStation: two[0],
      onStationChange: () => {},
    });
    expect(screen.getByTestId('topbar-station').tagName).toBe('SPAN');
  });
});
