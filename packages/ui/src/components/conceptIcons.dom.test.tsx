// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { stubContainerWidth } from './Dashboard/testing/containerWidth.js';
import { ToastProvider } from './primitives/ToastProvider.js';
import { TooltipProvider } from './primitives/Tooltip.js';
import { AppShell } from './AppShell.js';
import { ReportsNav } from './reports/ReportsNav.js';
import { NAV_PAGES } from '../nav-intent/routes.js';
import { Tabs } from '../pump-ds/tabs/index.js';
import type { Concept } from '../pump-ds/icon/index.js';

/**
 * One icon per concept (#523): the sidebar, page tabs, the Reports
 * sub-navigation and the command palette all read CONCEPT_ICON, so a concept
 * draws the same glyph on each. Compared through the rendered lucide glyph.
 */
vi.mock('../query/useSidebarBadges.js', async (orig) => ({
  ...(await orig<typeof import('../query/useSidebarBadges.js')>()),
  useSidebarBadges: () => ({
    shiftRunning: false,
    inventoryAlerts: 0,
    overdueCustomers: 0,
    openPastDays: 0,
  }),
}));

let stub: ReturnType<typeof stubContainerWidth>;
beforeEach(() => {
  stub = stubContainerWidth(1440);
  // cmdk measures and scrolls its list.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  stub.restore();
  vi.unstubAllGlobals();
});

/** The lucide glyph an element draws, e.g. `lucide-palette`. */
const glyph = (el: Element | null | undefined) =>
  el
    ?.querySelector('svg')
    ?.getAttribute('class')
    ?.split(/\s+/)
    .find((c) => c.startsWith('lucide-'));

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  code: 'HF',
  onboardingStatus: 'READY_FOR_OPERATIONS',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TooltipProvider>
          <AppShell
            navItems={[...NAV_PAGES]}
            currentPath="/dashboard"
            onNavigate={() => {}}
            userRole="Owner"
            userName="Owner"
            syncStatus="synced"
            onLogout={() => {}}
            stations={[station]}
            selectedStation={station}
            stationReady
          >
            <div />
          </AppShell>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function openPalette() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[0]);
  return screen.getByRole('dialog');
}

const tabGlyph = (concept: Concept) => {
  const { unmount } = render(
    <Tabs
      aria-label={`tab-${concept}`}
      activeId="x"
      onChange={() => {}}
      tabs={[{ id: 'x', label: 'x', concept }]}
    />,
  );
  const g = glyph(screen.getByRole('tab'));
  unmount();
  return g;
};

describe('concept → icon map (#523)', () => {
  it('a page shows the same glyph in the sidebar and in the palette “Go to” list', () => {
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    const sidebarGlyphs = NAV_PAGES.map((page) =>
      glyph(
        within(sidebar)
          .getAllByRole('button')
          .find((b) => b.textContent?.startsWith(page.label)),
      ),
    );
    const palette = openPalette();
    const paletteGlyphs = NAV_PAGES.map((page) =>
      glyph(
        within(palette)
          .getAllByRole('option')
          .find((o) => o.textContent === page.label),
      ),
    );
    expect(sidebarGlyphs.every(Boolean)).toBe(true);
    expect(paletteGlyphs).toEqual(sidebarGlyphs);
  });

  it.each([
    ['New expense', 'expenses'],
    ['New collection', 'collections'],
    ['New purchase', 'purchases'],
    ['New supplier payment', 'payments'],
    ['New credit sale', 'credit-sales'],
    ['New customer', 'customers'],
  ] as const)('palette “%s” shows the %s tab glyph', (label, concept) => {
    renderShell();
    const palette = openPalette();
    const option = within(palette)
      .getAllByRole('option')
      .find((o) => o.textContent === label);
    const expected = glyph(option);
    cleanup();
    expect(expected).toBeDefined();
    expect(tabGlyph(concept)).toBe(expected);
  });

  /** The glyph a page shows in the sidebar. */
  const sidebarGlyph = (label: string) =>
    glyph(
      within(screen.getByRole('navigation', { name: 'Main' }))
        .getAllByRole('button')
        .find((b) => b.textContent?.startsWith(label)),
    );

  it.each([
    ['New expense', 'Expenses'],
    ['New income', 'Income'],
    ['New customer', 'Customers'],
  ] as const)('palette “%s” shows the sidebar glyph of %s', (label, page) => {
    renderShell();
    const expected = sidebarGlyph(page);
    const palette = openPalette();
    const option = within(palette)
      .getAllByRole('option')
      .find((o) => o.textContent === label);
    expect(expected).toBeDefined();
    expect(glyph(option)).toBe(expected);
  });

  it.each([
    ['Expenses', 'expenses'],
    ['Income', 'income'],
    ['Customers', 'customers'],
    ['Suppliers', 'suppliers'],
    ['Accounts', 'accounts'],
  ] as const)('the %s tab inside its page shows the sidebar glyph', (page, concept) => {
    renderShell();
    const expected = sidebarGlyph(page);
    cleanup();
    expect(expected).toBeDefined();
    expect(tabGlyph(concept)).toBe(expected);
  });

  it('a Reports sub-navigation item shows the same glyph as the tab of that concept', () => {
    const concepts: Concept[] = ['decantations', 'gst', 'ledgers', 'dssr'];
    render(
      <ReportsNav
        groups={[{ heading: 'All', items: concepts.map((c) => ({ id: c, label: c, concept: c })) }]}
        activeId="dssr"
        onChange={() => {}}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Reports' });
    const navGlyphs = concepts.map((c) => glyph(within(nav).getByRole('button', { name: c })));
    cleanup();
    expect(concepts.map(tabGlyph)).toEqual(navGlyphs);
  });
});
