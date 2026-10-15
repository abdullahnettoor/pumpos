// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { stubContainerWidth } from './Dashboard/testing/containerWidth.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './primitives/ToastProvider.js';
import { AppShell, SIDEBAR_COLLAPSED_KEY, isSidebarShortcut, type NavItem } from './AppShell.js';
import type { SidebarBadges } from '../query/useSidebarBadges.js';
import { NAV_PAGES } from '../nav-intent/routes.js';

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

let stub: ReturnType<typeof stubContainerWidth>;
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
  stub = stubContainerWidth(1440);
  mockBadges = { shiftRunning: false, inventoryAlerts: 0, overdueCustomers: 0, openPastDays: 0 };
});

afterEach(() => {
  cleanup();
  stub.restore();
});

const mockNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
  { label: 'Shifts', path: '/shifts', icon: 'shifts' },
  { label: 'Station', path: '/setup/station', icon: 'station' },
  { label: 'Expenses', path: '/expenses', icon: 'expenses' },
  { label: 'Pricing', path: '/pricing', icon: 'pricing' },
  { label: 'Customers', path: '/customers', icon: 'customers' },
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
      navItems={[...NAV_PAGES]}
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

const sidebar = () => screen.getByRole('navigation').textContent!;

describe("AppShell on a page's detail route (#576)", () => {
  it("keeps Accounts active on an account's page", () => {
    shell({ currentPath: '/accounts/sbi?from=2026-09-01&to=2026-09-30' });
    const nav = screen.getByRole('navigation');
    const active = Array.from(nav.querySelectorAll('button')).filter((b) =>
      /\bbg-info-bg\b/.test(b.getAttribute('class') ?? ''),
    );
    expect(active.map((b) => b.textContent)).toEqual(['Accounts']);
  });
});

describe('AppShell sidebar groups (#540)', () => {
  it('shows the five groups to an Owner, in order', () => {
    shell();
    expect(sidebar()).toBe(
      [
        'Operate',
        'Dashboard',
        'Shifts',
        'Inventory',
        'Pricing',
        'Parties',
        'Customers',
        'Suppliers',
        'Books',
        'Accounts',
        'Expenses',
        'Income',
        'Insight',
        'Reports',
        'Setup',
        'Station',
        'Organization',
      ].join(''),
    );
  });

  it('filters pages by role: Manager has no Organization', () => {
    shell({ userRole: 'Manager' });
    expect(sidebar()).toMatch(/Setup.*Station/);
    expect(sidebar()).not.toContain('Organization');
  });

  it('filters pages by role: Accountant sees Books and Reports but no Pricing or Setup', () => {
    shell({ userRole: 'Accountant' });
    expect(sidebar()).toMatch(/Parties.*Customers.*Suppliers.*Books.*Accounts.*Insight.*Reports/);
    expect(sidebar()).not.toContain('Pricing');
    expect(sidebar()).not.toContain('Setup');
  });

  it('filters pages by role: Staff sees only their pages', () => {
    shell({ userRole: 'Staff' });
    expect(sidebar()).toMatch(
      /Operate.*Dashboard.*Shifts.*Parties.*Customers.*Books.*Expenses.*Income/,
    );
    for (const hidden of ['Inventory', 'Suppliers', 'Accounts', 'Reports', 'Station', 'Insight']) {
      expect(sidebar()).not.toContain(hidden);
    }
  });

  it('navigates to Suppliers on its new route', () => {
    const onNavigate = vi.fn();
    shell({ onNavigate });
    fireEvent.click(screen.getByRole('button', { name: 'Suppliers' }));
    expect(onNavigate).toHaveBeenCalledWith('/suppliers');
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

  it('toggles from the sidebar edge: a pointer affordance outside the tab order (#604)', () => {
    shell();
    const edge = screen.getByTestId('sidebar-edge');
    expect(edge.getAttribute('aria-hidden')).toBe('true');
    expect(edge.tabIndex).toBe(-1);
    // Not a second "Collapse sidebar" control for a screen reader.
    expect(screen.getAllByRole('button', { name: /collapse sidebar/i })).toHaveLength(1);
    fireEvent.click(edge);
    expect(screen.getByRole('button', { name: /expand sidebar/i })).not.toBeNull();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    fireEvent.click(edge);
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).not.toBeNull();
  });

  it('toggles with ⌘\\ or Ctrl+\\, and the Collapse button names the shortcut (#604)', () => {
    shell();
    const button = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Meta+\\ Control+\\');
    fireEvent.keyDown(document, { key: '\\', code: 'Backslash', metaKey: true });
    expect(
      screen.getByRole('button', { name: /expand sidebar/i }).getAttribute('aria-expanded'),
    ).toBe('false');
    fireEvent.keyDown(document, { key: '\\', code: 'Backslash', ctrlKey: true });
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).not.toBeNull();
    // A plain backslash (typing) does nothing.
    fireEvent.keyDown(document, { key: '\\', code: 'Backslash' });
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).not.toBeNull();
  });

  it('matches the sidebar shortcut only with ⌘ or Ctrl and no other modifier', () => {
    const k = (over: Partial<KeyboardEvent>) =>
      isSidebarShortcut({
        key: '\\',
        code: 'Backslash',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        ...over,
      });
    expect(k({ metaKey: true })).toBe(true);
    expect(k({ ctrlKey: true })).toBe(true);
    expect(k({})).toBe(false);
    expect(k({ ctrlKey: true, shiftKey: true })).toBe(false);
    expect(k({ metaKey: true, altKey: true })).toBe(false);
    expect(k({ metaKey: true, key: 'k', code: 'KeyK' })).toBe(false);
    // Not ours when handled already, mid-composition, or while typing.
    expect(k({ metaKey: true, defaultPrevented: true })).toBe(false);
    expect(k({ ctrlKey: true, isComposing: true })).toBe(false);
    for (const tag of ['input', 'textarea', 'select']) {
      expect(k({ metaKey: true, target: document.createElement(tag) }), tag).toBe(false);
    }
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editable.appendChild(inner);
    expect(k({ metaKey: true, target: inner })).toBe(false);
    expect(k({ metaKey: true, target: document.createElement('button') })).toBe(true);
  });

  it('leaves ⌘\\ alone inside a text field', () => {
    shell();
    const field = document.createElement('input');
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: '\\', code: 'Backslash', metaKey: true });
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).not.toBeNull();
    field.remove();
  });

  it('becomes an icon rail below 1200px of app width and keeps the saved choice', () => {
    stub.restore();
    stub = stubContainerWidth(1100);
    shell();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).not.toBeNull();
    expect(screen.queryByText('Operate')).toBeNull();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
    // The rail is forced: no edge to click, and the shortcut changes nothing.
    expect(screen.queryByTestId('sidebar-edge')).toBeNull();
    fireEvent.keyDown(document, { key: '\\', code: 'Backslash', metaKey: true });
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
    act(() => stub.setWidth(1400));
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).not.toBeNull();
    expect(screen.getByText('Operate')).not.toBeNull();
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
