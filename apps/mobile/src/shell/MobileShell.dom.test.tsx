// @vitest-environment jsdom
import React, { useLayoutEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Role, Station } from '@pump/shared';
import { THEME_COLORS, THEME_STORAGE_KEY } from '../theme/config.js';

/**
 * Screen tests for the Control Room shell: Role-filtered dock, the Account
 * sheet, the detail-page stack (dock swap, back, scroll, per-tab stacks) and
 * the system back gesture. The tab screens are stand-ins; `@pump/ui` is the
 * mock seam for the sheet's data hooks (as in HandoverPanel.dom.test.tsx).
 */
const query = (data: unknown) => ({ data, isLoading: false });
const users = [
  { id: 'u1', fullName: 'Abdullah Nettoor', status: 'ACTIVE' },
  { id: 'u2', fullName: 'Ramesh K', status: 'ACTIVE' },
  { id: 'u3', fullName: 'Sajid P', status: 'ACTIVE' },
  { id: 'u4', fullName: 'Old Hand', status: 'INACTIVE' },
];
const shiftStatus = {
  activeShift: {
    staffAssignments: [
      { userName: 'Ramesh K', duName: 'DU1' },
      { userName: 'Sajid P', duName: 'DU2' },
      { userName: 'Ramesh K', duName: 'DU3' },
    ],
  },
};

const mine = vi.hoisted(() => ({ assignment: null as unknown }));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useMyAssignment: () => query(mine.assignment),
    useUsers: () => query(users),
    useStations: () => query([]),
    useShiftStatus: () => query(shiftStatus),
    useOrganization: () => query({ name: 'Malabar Fuels Pvt Ltd' }),
    useAccess: () => query({ plan: 'CORE' }),
  };
});
const alerts = [
  { id: 'tank-1', severity: 'danger', category: 'stock', title: 'HSD critically low' },
  {
    id: 'day-2026-10-08',
    severity: 'warning',
    category: 'day',
    title: 'Thu, 8 Oct not closed',
    action: { kind: 'day', businessDate: '2026-10-08' },
  },
];
vi.mock('../lib/alerts.js', () => ({ useMobileAlerts: () => alerts }));

const { MobileShell } = await import('./MobileShell.js');
const { NavProvider, useNav } = await import('./nav.js');
const { tabsForRole } = await import('./tabs.js');
const { HomeHeader } = await import('./HomeHeader.js');
const { TabHeader } = await import('./TabHeader.js');
const { DetailPage } = await import('../ui/DetailPage.js');
const { ThemeProvider } = await import('../theme/index.js');

const stations = [
  { id: 'st-1', name: 'Highway Fuels', address: 'Kozhikode', settings: {} },
  { id: 'st-2', name: 'City Fuels', address: 'Feroke', settings: {} },
] as unknown as Station[];

/** The shell's `useNav()`, for driving navigation the way a feature ticket would. */
const holder = { nav: null as unknown as ReturnType<typeof useNav> };
const Probe: React.FC = () => {
  const n = useNav();
  useLayoutEffect(() => {
    holder.nav = n;
  });
  return null;
};

const Detail: React.FC<{ name: string; withBar?: boolean }> = ({ name, withBar = true }) => (
  <DetailPage
    title={name}
    subtitle="detail"
    share={withBar ? { onPress: () => {} } : undefined}
    download={withBar ? { onPress: () => {}, label: 'Download PDF' } : undefined}
  >
    <p>{name} body</p>
  </DetailPage>
);

/** Stand-in roots: Home uses the real HomeHeader, the rest TabHeader. */
const Root: React.FC<{ tab: string; stationName: string }> = ({ tab, stationName }) => {
  const n = useNav();
  return (
    <div data-testid={`root-${tab}`}>
      {tab === 'home' ? (
        <HomeHeader onOpenAttention={() => n.push(<Detail name="attention" />, 'attention')} />
      ) : (
        <TabHeader title={tab} />
      )}
      <p>
        {tab} list · {stationName}
      </p>
      <button type="button" onClick={() => n.push(<Detail name={`${tab} item`} />, `${tab}:1`)}>
        Open {tab} item
      </button>
    </div>
  );
};

const queryClient = new QueryClient();

const Harness: React.FC<{
  role?: Role;
  onSignOut?: () => void;
  onStationChange?: (id: string) => void;
}> = ({ role = 'Owner', onSignOut = () => {}, onStationChange }) => {
  const [stationId, setStationId] = useState('st-1');
  const name = stations.find((s) => s.id === stationId)!.name;
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <NavProvider tabs={tabsForRole(role, false)}>
          <Probe />
          <MobileShell
            userName="Abdullah Nettoor"
            role={role}
            stations={stations}
            selectedStationId={stationId}
            onSelectStation={(id) => {
              setStationId(id);
              onStationChange?.(id);
            }}
            onSignOut={onSignOut}
            renderRoot={(tab) => <Root tab={tab} stationName={name} />}
          />
        </NavProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

/** Let queued history traversals land (jsdom fires popstate on a later task). */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));
const dock = () => screen.queryByRole('navigation', { name: 'Main' });
const dockLabels = () =>
  within(dock()!)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));
const sheet = () => screen.queryByRole('dialog', { name: 'Account' });
/** The visible (non-hidden) pane's scroll container, found from a node inside it. */
const paneOf = (el: HTMLElement) => el.closest('div.overflow-y-auto') as HTMLElement;

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  document.documentElement.className = '';
  document.head.innerHTML = '';
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('dock', () => {
  it.each([
    ['Owner', ['Home', 'Shifts', 'Reports', 'Money', 'Insights']],
    ['Manager', ['Shifts', 'Reports', 'Money', 'Insights']],
    ['Accountant', ['Reports', 'Money']],
  ] as const)('%s sees only their tabs, icon-only', (role, labels) => {
    render(<Harness role={role} />);
    expect(dockLabels()).toEqual(labels);
    // Icon-only: the visible text lives in aria-labels, not in the buttons.
    expect(within(dock()!).queryByText('Home')).toBeNull();
  });

  it('marks the active tab and switches the shown screen', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Shifts' }));
    expect(screen.getByRole('button', { name: 'Shifts' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(paneOf(screen.getByText(/^shifts list/)).classList.contains('hidden')).toBe(false);
    expect(paneOf(screen.getByText(/^home list/)).classList.contains('hidden')).toBe(true);
  });

  it('an Accountant starts on their first tab, not Home', () => {
    render(<Harness role="Accountant" />);
    expect(screen.getByRole('button', { name: 'Reports' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

describe('header', () => {
  afterEach(() => {
    mine.assignment = null;
  });

  it('shows the open-alert count on the bell', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Alerts, 2 open' })).toBeTruthy();
  });

  it('hides the badge text from assistive tech (the button label carries the count)', () => {
    render(<Harness />);
    const badge = screen.getByRole('button', { name: 'Alerts, 2 open' }).querySelector('.num');
    expect(badge?.textContent).toBe('2');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
  });

  it('the bell calls onOpenAttention: the page it pushes replaces the dock, back returns', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts, 2 open' }));
    expect(holder.nav.active).toBe('home');
    expect(holder.nav.depth).toBe(1);
    expect(dock()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(holder.nav.depth).toBe(0));
  });

  it('has no station-picker row and no business-day pill', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Pick business day')).toBeNull();
    expect(screen.queryByLabelText('Previous day')).toBeNull();
    // Both stations are reachable only through the Account sheet.
    expect(screen.queryByRole('button', { name: /City Fuels/ })).toBeNull();
  });
});

describe('Account sheet', () => {
  it('opens from the station name', () => {
    render(<Harness />);
    expect(sheet()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Highway Fuels, open account/ }));
    expect(sheet()).toBeTruthy();
  });

  it('opens from the avatar and shows who is signed in', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const s = within(sheet()!);
    expect(s.getByText('Abdullah Nettoor')).toBeTruthy();
    expect(s.getByText('Owner · Malabar Fuels Pvt Ltd')).toBeTruthy();
  });

  it('ticks the current station and switches station, updating every tab', () => {
    const onStationChange = vi.fn();
    render(<Harness onStationChange={onStationChange} />);
    // Visit Shifts too, so both tabs are mounted.
    fireEvent.click(screen.getByRole('button', { name: 'Shifts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByText('home list · Highway Fuels')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const s = within(sheet()!);
    const current = s.getByRole('button', { name: /Highway Fuels/ });
    expect(within(current).getByRole('img', { name: 'Current station' })).toBeTruthy();
    expect(
      within(s.getByRole('button', { name: /City Fuels/ })).queryByRole('img', {
        name: 'Current station',
      }),
    ).toBeNull();

    fireEvent.click(s.getByRole('button', { name: /City Fuels/ }));
    expect(onStationChange).toHaveBeenCalledWith('st-2');
    expect(sheet()).toBeNull();
    expect(screen.getByText('home list · City Fuels')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Shifts' }));
    expect(screen.getByText('shifts list · City Fuels')).toBeTruthy();
  });

  it('drops pushed pages when the station changes', async () => {
    render(<Harness />);
    act(() => holder.nav.select('shifts'));
    fireEvent.click(screen.getByRole('button', { name: 'Open shifts item' }));
    expect(screen.getByText('shifts item body')).toBeTruthy();
    act(() => holder.nav.select('home'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(within(sheet()!).getByRole('button', { name: /City Fuels/ }));
    act(() => holder.nav.select('shifts'));
    expect(screen.queryByText('shifts item body')).toBeNull();
    expect(holder.nav.depth).toBe(0);
    expect(screen.getByText('shifts list · City Fuels')).toBeTruthy();
  });

  it('shows the team summary: member count and who is on shift now', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const s = within(sheet()!);
    expect(s.getByText('3 members')).toBeTruthy(); // the inactive user is not counted
    expect(s.getByText('2 on shift now')).toBeTruthy(); // Ramesh is on two DUs, counted once
    expect(s.getByText('Ramesh K, Sajid P')).toBeTruthy();
  });

  it('opens the Team page from the Team row and closes the sheet', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(within(sheet()!).getByRole('button', { name: /2 on shift now/ }));
    expect(sheet()).toBeNull();
    expect(holder.nav.depth).toBe(1);
    expect(await screen.findByRole('heading', { name: 'Team' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ramesh K/ })).toBeTruthy();
    // Back returns to the tab the person was on.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await settle();
    expect(holder.nav.depth).toBe(0);
  });

  it('shows the Organization name and plan', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const s = within(sheet()!);
    expect(s.getByText('Malabar Fuels Pvt Ltd')).toBeTruthy();
    expect(s.getByText('Plan · Core')).toBeTruthy();
  });

  it('signs out and closes', () => {
    const onSignOut = vi.fn();
    render(<Harness onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(within(sheet()!).getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(sheet()).toBeNull();
  });

  it('closes on Escape and on the scrim', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.keyDown(sheet()!, { key: 'Escape' });
    expect(sheet()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(sheet()!.previousElementSibling!);
    expect(sheet()).toBeNull();
  });

  it('as shipped: no Appearance row, Light applied even with a stored dark preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(sheet()).toBeTruthy(); // the sheet really opened, so its absent rows are meaningful
    expect(within(sheet()!).getByText('Station')).toBeTruthy();
    expect(screen.queryByText('Appearance')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      THEME_COLORS.light,
    );
  });

  it('mounts the Appearance control once it is enabled', () => {
    render(
      <ThemeProvider appearanceEnabled devSwitchEnabled={false}>
        <NavProvider tabs={['home']}>
          <MobileShell
            userName="A"
            role="Owner"
            stations={stations}
            selectedStationId="st-1"
            onSelectStation={() => {}}
            onSignOut={() => {}}
            renderRoot={(tab) => <Root tab={tab} stationName="x" />}
          />
        </NavProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeTruthy();
  });
});

describe('Account sheet focus and background', () => {
  const openFromAvatar = () => {
    const avatar = screen.getByRole('button', { name: 'Account' });
    avatar.focus();
    fireEvent.click(avatar);
    return avatar;
  };

  it('moves focus into the sheet and makes the page behind inert while open', () => {
    const { container } = render(<Harness />);
    expect(container.hasAttribute('inert')).toBe(false);
    openFromAvatar();
    expect(document.activeElement).toBe(sheet());
    expect(container.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(sheet()!, { key: 'Escape' });
    expect(container.hasAttribute('inert')).toBe(false);
  });

  it('keeps Tab inside the sheet, wrapping at both ends', () => {
    render(<Harness />);
    openFromAvatar();
    const buttons = within(sheet()!).getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    expect(last.textContent).toBe('Sign out');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('pulls focus back if it escapes to the page behind', () => {
    render(<Harness />);
    const avatar = openFromAvatar();
    avatar.focus();
    expect(document.activeElement).toBe(sheet());
  });

  it('returns focus to what opened the sheet', () => {
    render(<Harness />);
    const avatar = openFromAvatar();
    fireEvent.keyDown(sheet()!, { key: 'Escape' });
    expect(document.activeElement).toBe(avatar);
  });

  it('after a station switch focus lands on the new header, not a removed node', () => {
    render(<Harness />);
    const avatar = openFromAvatar();
    fireEvent.click(within(sheet()!).getByRole('button', { name: /City Fuels/ }));
    expect(sheet()).toBeNull();
    expect(avatar.isConnected).toBe(false); // the shell remounted
    const station = screen.getByRole('button', { name: /City Fuels, open account/ });
    expect(document.activeElement).toBe(station);
  });
});

describe('detail-page stack', () => {
  it('a pushed page hides the dock and shows the action bar', () => {
    render(<Harness />);
    expect(dock()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open home item' }));
    expect(dock()).toBeNull();
    expect(screen.getByText('home item body')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy();
  });

  it('a detail page without actions has no action bar', () => {
    render(<Harness />);
    act(() => holder.nav.push(<Detail name="plain" withBar={false} />, 'plain'));
    expect(screen.getByText('plain body')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('the back button returns to the list and shows the dock again', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open home item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(holder.nav.depth).toBe(0));
    expect(screen.queryByText('home item body')).toBeNull();
    expect(paneOf(screen.getByText(/^home list/)).classList.contains('hidden')).toBe(false);
    expect(dock()).toBeTruthy();
  });

  it('the system back gesture pops the stack instead of leaving the app', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open home item' }));
    expect(holder.nav.depth).toBe(1);
    act(() => window.history.back());
    await waitFor(() => expect(holder.nav.depth).toBe(0));
    expect(screen.queryByText('home item body')).toBeNull();
  });

  it('pops one level per back through a deeper stack', async () => {
    render(<Harness />);
    act(() => holder.nav.push(<Detail name="one" />, 'one'));
    act(() => holder.nav.push(<Detail name="two" />, 'two'));
    expect(holder.nav.depth).toBe(2);
    act(() => window.history.back());
    await waitFor(() => expect(holder.nav.depth).toBe(1));
    expect(screen.getByText('one body')).toBeTruthy();
    expect(screen.queryByText('two body')).toBeNull();
  });

  it('keeps the list scroll position across push and back', async () => {
    render(<Harness />);
    const list = paneOf(screen.getByText(/^home list/));
    let top = 0;
    Object.defineProperty(list, 'scrollTop', {
      get: () => top,
      set: (v: number) => {
        top = v;
      },
      configurable: true,
    });
    top = 240;
    fireEvent.scroll(list);
    fireEvent.click(screen.getByRole('button', { name: 'Open home item' }));
    top = 0; // a hidden pane loses its offset
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(holder.nav.depth).toBe(0));
    expect(top).toBe(240);
  });

  it("keeps each tab's stack while another tab is showing", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open home item' }));
    act(() => holder.nav.select('shifts'));
    expect(holder.nav.depth).toBe(0);
    expect(dock()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open shifts item' }));
    expect(holder.nav.depth).toBe(1);
    act(() => holder.nav.select('home'));
    // Home is still on its detail page; Shifts keeps its own.
    expect(holder.nav.depth).toBe(1);
    expect(dock()).toBeNull();
    expect(paneOf(screen.getByText('home item body')).classList.contains('hidden')).toBe(false);
    act(() => holder.nav.select('shifts'));
    expect(paneOf(screen.getByText('shifts item body')).classList.contains('hidden')).toBe(false);
  });

  it("back on a tab pops only that tab's stack", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open home item' }));
    act(() => holder.nav.select('shifts'));
    await settle(); // home's history entry unwinds
    fireEvent.click(screen.getByRole('button', { name: 'Open shifts item' }));
    act(() => window.history.back());
    await waitFor(() => expect(holder.nav.depth).toBe(0)); // shifts popped
    act(() => holder.nav.select('home'));
    expect(holder.nav.depth).toBe(1); // home's page untouched
    expect(screen.getByText('home item body')).toBeTruthy();
  });

  it('the system back gesture closes an open Account sheet first', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(sheet()).toBeTruthy();
    act(() => window.history.back());
    await waitFor(() => expect(sheet()).toBeNull());
  });

  it('open() jumps to another tab and pushes there', () => {
    render(<Harness />);
    act(() => holder.nav.open('money', <Detail name="customer" />, 'customer:1'));
    expect(holder.nav.active).toBe('money');
    expect(screen.getByText('customer body')).toBeTruthy();
  });
});
