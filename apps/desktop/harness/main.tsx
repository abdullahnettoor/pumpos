/**
 * THROWAWAY visual harness for Reports (never committed). Renders the real
 * `ReportsOverview` from @pump/ui against stubbed API data, no backend.
 *
 *   /harness.html?tab=<tab>&view=<view>&entity=<entity>&theme=dark|light&fail=1
 *
 * See README.md for the parameters.
 */
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import {
  QueryProvider,
  createQueryClient,
  ErrorBoundary,
  ConfirmProvider,
  ToastProvider,
  ThemeProvider,
  ReportsOverview,
} from '@pump/ui';
import '@pump/ui/src/index.css';
import '@pump/ui/src/pump-ds/tailwind.css';
import { installFetchStub } from './fetchStub';
import { STATION } from './fixtures';

const params = new URLSearchParams(location.search);

// Keep every console error/warning for a quick `window.__harnessLog` check.
const harnessLog: string[] = [];
(window as any).__harnessLog = harnessLog;
for (const level of ['error', 'warn'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    harnessLog.push(`${level}: ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')}`);
    original(...args);
  };
}
const failParam = params.get('fail');
const fail = failParam === 'all' ? 'all' : failParam ? 'reports' : 'none';

// A clean cache every load: the persisted query cache would otherwise mask
// fixture edits and the fail mode. This origin (harness port) is the harness's own.
try {
  localStorage.clear();
} catch {
  /* storage unavailable */
}
installFetchStub(fail);

const TAB_LABEL: Record<string, string> = {
  'daily-dssr': 'DSR',
  'attendant-handovers': 'Attendant handovers',
  decantations: 'Decantations',
  pnl: 'Profit & loss',
  ledger: 'Ledgers',
  invoices: 'Invoices',
  gst: 'GST',
  'expense-register': 'Expense register',
};
const VIEW: Record<string, [group: string, label: string]> = {
  party: ['Ledger view', 'Party'],
  'cash-bank': ['Ledger view', 'Cash & bank'],
  sales: ['GST view', 'Sales'],
  purchases: ['GST view', 'Purchases (ITC)'],
  income: ['GST view', 'Income'],
};
const ENTITY_LABEL: Record<string, string> = {
  customer: 'Customer',
  supplier: 'Supplier',
  cash: 'Cash',
  bank: 'Bank',
  owner: 'Owner',
};
const RANGE_LABEL: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'last-7': 'Last 7 days',
  'this-week': 'This week',
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30': 'Last 30 days',
  'this-year': 'This year',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(find: () => T | null | undefined, what: string, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = find();
    if (v) return v;
    if (Date.now() > end) throw new Error(`[harness] timed out waiting for ${what}`);
    await sleep(60);
  }
}
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const content = () => document.querySelector('[data-harness="content"]') as HTMLElement;
const mouseDown = (el: Element) =>
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));

/** Drive the page to the requested tab / view / entity, as an operator would click. */
async function drive() {
  const tab = params.get('tab');
  if (tab && tab !== 'daily-dssr') {
    const label = TAB_LABEL[tab];
    if (!label) throw new Error(`[harness] unknown tab "${tab}"`);
    const button = await waitFor(
      () =>
        [...document.querySelectorAll('nav[aria-label="Reports"] button')].find(
          (b) => text(b) === label,
        ) as HTMLButtonElement | undefined,
      `the "${label}" report`,
    );
    button.click();
    await waitFor(() => button.getAttribute('aria-current') === 'page', 'the report to open');
    await sleep(250);
  }

  const view = params.get('view');
  if (view) {
    const [group, label] = VIEW[view] ?? [];
    if (!group) throw new Error(`[harness] unknown view "${view}"`);
    const radio = await waitFor(
      () =>
        [
          ...document.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`),
        ].find((r) => text(r) === label) as HTMLElement | undefined,
      `the "${label}" view`,
    );
    radio.click();
    await sleep(250);
  }

  const entity = params.get('entity');
  if (entity) {
    const label = ENTITY_LABEL[entity];
    if (!label) throw new Error(`[harness] unknown entity "${entity}"`);
    const typePicker = await waitFor(
      () => content().querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement | null,
      'the ledger type picker',
    );
    if (text(typePicker) !== label) {
      typePicker.click();
      const option = await waitFor(
        () => [...document.querySelectorAll('[role="option"]')].find((o) => text(o) === label),
        `the "${label}" ledger option`,
      );
      mouseDown(option);
    }
    if (entity === 'customer' || entity === 'supplier') {
      const party = (params.get('party') ?? '').toLowerCase();
      const partyPicker = await waitFor(
        () =>
          content().querySelectorAll('button[aria-haspopup="listbox"]')[1] as
            | HTMLButtonElement
            | undefined,
        'the party picker',
      );
      partyPicker.click();
      const option = await waitFor(
        () =>
          [...document.querySelectorAll('[role="option"]')].find(
            (o) => !party || text(o).toLowerCase().includes(party),
          ),
        `a ${entity} option`,
      );
      mouseDown(option);
    }
  }

  // Pick a period preset from the report's range menu.
  const range = params.get('range');
  if (range) {
    const label = RANGE_LABEL[range];
    if (!label) throw new Error(`[harness] unknown range "${range}"`);
    const trigger = await waitFor(
      () => content().querySelector('button[aria-label*="period" i]') as HTMLButtonElement | null,
      'the period menu',
    );
    trigger.click();
    const item = await waitFor(
      () =>
        [...document.querySelectorAll('[role="menuitemradio"]')].find((m) =>
          text(m).startsWith(label),
        ) as HTMLElement | undefined,
      `the "${label}" period`,
    );
    item.click();
    await sleep(150);
  }

  // Generic: click buttons / radios / chips / menu items whose text starts with each value.
  for (const want of params.getAll('click')) {
    const el = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            '[data-harness="content"] button, [role="radio"], [role="tab"], [role="menuitem"], [role="menuitemradio"]',
          ),
        ].find((b) => text(b).startsWith(want)) as HTMLElement | undefined,
      `a "${want}" control`,
    );
    el.click();
    await sleep(150);
  }

  // Open the first row of the report's table (a drawer, or the DSR day).
  if (params.get('open')) {
    const row = await waitFor(
      () => {
        const want = params.get('open')!;
        if (want !== '1')
          return (Array.from(content().querySelectorAll('tbody tr')).find((r) =>
            (r.textContent ?? '').includes(want),
          ) ?? null) as HTMLElement | null;
        return content().querySelector('tbody tr[tabindex], tbody tr') as HTMLElement | null;
      },
      'a table row',
    );
    row.click();
  }
}

const SIDEBAR = ['Dashboard', 'Shifts', 'Sales', 'Purchases', 'Customers', 'Accounts', 'Reports', 'Station'];

let driven = false;

const Harness: React.FC = () => {
  useEffect(() => {
    // StrictMode mounts twice; drive the page once.
    if (driven) return;
    driven = true;
    void drive()
      .catch((e) => console.error(e))
      .finally(() => {
        // No focus ring left on whatever the harness clicked last.
        if (!params.get('open')) (document.activeElement as HTMLElement | null)?.blur?.();
        // Let the last clicked view fetch and paint before declaring ready.
        setTimeout(() => (document.body.dataset.harness = 'ready'), fail === 'none' ? 600 : 2500);
      });
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg-canvas)' }}>
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          backgroundColor: 'var(--bg-surface-alt)',
          borderRight: '1px solid var(--border-soft)',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div className="px-3 pb-3 text-[14px] font-semibold text-ink-strong">PumpOS</div>
        {SIDEBAR.map((label) => (
          <div
            key={label}
            className={
              label === 'Reports'
                ? 'rounded-button bg-info-bg px-3 py-2 text-[13px] font-semibold text-info-fg'
                : 'px-3 py-2 text-[13px] font-medium text-ink-muted'
            }
          >
            {label}
          </div>
        ))}
      </aside>
      <main
        data-harness="content"
        style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', position: 'relative' }}
      >
        <ReportsOverview
          selectedStation={STATION}
          userRole="Owner"
          {...({
            onNavigate: (path: string, intent?: unknown) => console.log('navigate', path, intent),
          } as Record<string, unknown>)}
        />
      </main>
    </div>
  );
};

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryProvider client={queryClient}>
          <ToastProvider>
            <ConfirmProvider>
              <Harness />
            </ConfirmProvider>
          </ToastProvider>
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
