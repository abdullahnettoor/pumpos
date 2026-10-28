// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vite-plus/test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { stubContainerWidth } from './Dashboard/testing/containerWidth.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './primitives/ToastProvider.js';
import { TooltipProvider } from './primitives/Tooltip.js';
import { Drawer } from './Drawer.js';
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
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>{node}</ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
  const result = render(wrap(ui));
  return { ...result, rerender: (node: React.ReactElement) => result.rerender(wrap(node)) };
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

    // When collapsed, the label is the accessible name and the text span is not rendered
    expect(screen.queryByText('Shifts')).toBeNull();
    const collapsedBtn = screen.getByRole('button', { name: 'Shifts' });
    expect(collapsedBtn.hasAttribute('title')).toBe(false);
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

const shellEl = (
  props: Partial<React.ComponentProps<typeof AppShell>> = {},
  body: React.ReactNode = <div>Body</div>,
) => (
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
    {body}
  </AppShell>
);

const shell = (
  props: Partial<React.ComponentProps<typeof AppShell>> = {},
  body?: React.ReactNode,
) => renderWithProviders(shellEl(props, body));

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
    // No edge to click on a forced rail.
    expect(screen.queryByTestId('sidebar-edge')).toBeNull();
    act(() => stub.setWidth(1400));
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).not.toBeNull();
    expect(screen.getByText('Operate')).not.toBeNull();
  });
});

describe('AppShell rail tooltips (#657)', () => {
  const collapse = () => fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

  it('shows the label on focus for a collapsed rail, with no title', () => {
    shell();
    collapse();
    const btn = screen.getByRole('button', { name: 'Shifts' });
    expect(btn.hasAttribute('title')).toBe(false);
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip').textContent).toBe('Shifts');
  });

  it('shows on pointer hover for a collapsed rail', async () => {
    shell();
    collapse();
    const btn = screen.getByRole('button', { name: 'Shifts' });
    fireEvent.pointerMove(btn, { pointerType: 'mouse' });
    expect((await screen.findByRole('tooltip', {}, { timeout: 1000 })).textContent).toBe('Shifts');
  });

  it('keeps focus on the same nav button across Ctrl+\\ and the foot toggle', () => {
    shell();
    const btn = screen.getByRole('button', { name: 'Shifts' });
    btn.focus();
    fireEvent.keyDown(btn, { key: '\\', code: 'Backslash', ctrlKey: true });
    expect(document.activeElement).toBe(btn);
    expect(screen.getByRole('button', { name: 'Shifts' })).toBe(btn);
    const foot = screen.getByRole('button', { name: /expand sidebar/i });
    foot.focus();
    fireEvent.click(foot);
    expect(document.activeElement).toBe(foot);
  });

  it('adds the badge text to the tooltip', () => {
    mockBadges = { shiftRunning: false, inventoryAlerts: 3, overdueCustomers: 0, openPastDays: 0 };
    shell();
    collapse();
    fireEvent.focus(screen.getByRole('button', { name: 'Inventory' }));
    expect(screen.getByRole('tooltip').textContent).toBe('Inventory · 3 inventory alerts');
  });

  it('shows no tooltip on an expanded sidebar', () => {
    shell();
    fireEvent.focus(screen.getByRole('button', { name: 'Shifts' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('names the shortcut in a tooltip on the foot control instead of a title', () => {
    shell();
    const btn = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(btn.hasAttribute('title')).toBe(false);
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip').textContent).toMatch(/^Collapse sidebar \(.+\)$/);
  });
});

describe('AppShell overlay sidebar below 1200px (#657)', () => {
  beforeEach(() => {
    stub.restore();
    stub = stubContainerWidth(1100);
  });
  const expand = () => fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));

  it('enables Expand and opens the full sidebar without touching the saved choice', () => {
    shell();
    const btn = screen.getByRole('button', { name: /expand sidebar/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(screen.getByText('Operate')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: /collapse sidebar/i }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
  });

  it('floats over the content: the rail keeps its 60px slot', () => {
    shell();
    const aside = screen.getByRole('complementary');
    expect(aside.style.width).toBe('60px');
    expand();
    expect(aside.style.width).toBe('60px');
    expect(screen.getByTestId('sidebar-panel').style.width).toBe('220px');
    expect(screen.getByTestId('sidebar-panel').style.position).toBe('absolute');
  });

  it('toggles with Ctrl+\\', () => {
    shell();
    fireEvent.keyDown(document, { key: '\\', code: 'Backslash', ctrlKey: true });
    expect(screen.getByText('Operate')).not.toBeNull();
    fireEvent.keyDown(document, { key: '\\', code: 'Backslash', ctrlKey: true });
    expect(screen.queryByText('Operate')).toBeNull();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
  });

  it('closes on Esc and returns focus to the Expand control', () => {
    shell();
    expand();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Operate')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /expand sidebar/i }));
  });

  it('leaves Esc to an open Drawer, then closes the overlay on the next one', () => {
    const onClose = vi.fn();
    shell(
      {},
      <Drawer isOpen onClose={onClose} title="Edit">
        <div>Drawer body</div>
      </Drawer>,
    );
    expand();
    const expandBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Operate')).not.toBeNull();
    expect(document.activeElement).not.toBe(expandBtn);
  });

  it('closes the overlay on Esc once no Drawer is open', () => {
    const { rerender } = shell(
      {},
      <Drawer isOpen onClose={() => {}} title="Edit">
        <div>Drawer body</div>
      </Drawer>,
    );
    expand();
    rerender(shellEl());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Operate')).toBeNull();
  });

  it('closes when the page changes from elsewhere (palette, top bar)', () => {
    const { rerender } = shell();
    expand();
    rerender(shellEl({ currentPath: '/suppliers' }));
    expect(screen.queryByText('Operate')).toBeNull();
  });

  it('closes via the foot Collapse button', () => {
    shell();
    expand();
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(screen.queryByText('Operate')).toBeNull();
  });

  it.each(['0', '1'])(
    'leaves a saved preference of %s alone when the overlay opens and closes',
    (v) => {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v);
      shell();
      expand();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe(v);
    },
  );

  it('shows the rail tooltip on the forced narrow rail', () => {
    shell();
    fireEvent.focus(screen.getByRole('button', { name: 'Shifts' }));
    expect(screen.getByRole('tooltip').textContent).toBe('Shifts');
  });

  it('closes after navigating', () => {
    const onNavigate = vi.fn();
    shell({ onNavigate });
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Suppliers' }));
    expect(onNavigate).toHaveBeenCalledWith('/suppliers');
    expect(screen.queryByText('Operate')).toBeNull();
  });

  it('closes on a pointer press outside, not inside', () => {
    shell();
    expand();
    fireEvent.pointerDown(screen.getByText('Operate'));
    expect(screen.getByText('Operate')).not.toBeNull();
    fireEvent.pointerDown(screen.getByText('Body'));
    expect(screen.queryByText('Operate')).toBeNull();
  });

  it('closes when the window widens past 1200px', () => {
    shell();
    expand();
    act(() => stub.setWidth(1400));
    // Wide mode follows the saved choice (expanded), no stale overlay state.
    act(() => stub.setWidth(1100));
    expect(screen.queryByText('Operate')).toBeNull();
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

describe('AppShell build badge (#603)', () => {
  it('sits in the status bar, not over the page', () => {
    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        currentPath="/dashboard"
        onNavigate={() => {}}
        userRole="Owner"
        userName="Admin User"
        syncStatus="synced"
        environmentTag="Preview"
        onLogout={() => {}}
      >
        <div>Content Body</div>
      </AppShell>,
    );
    const badge = screen.getByTestId('statusbar-environment');
    expect(badge.textContent).toBe('Preview');
    expect(screen.getByRole('main').contains(badge)).toBe(false);
    expect(screen.getAllByText('Preview')).toHaveLength(1);
  });
});
