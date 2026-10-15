import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveEntryDate } from '@pump/shared';
import {
  Button,
  Icon,
  Tabs,
  computeRange,
  tabPanelProps,
  type DateRange,
  type TabItem,
} from '../../pump-ds/index.js';
import { useFinancialAccounts } from '../../query/hooks.js';
import { ROUTES, accountRoute, parseAccountRoute } from '../../nav-intent/routes.js';
import { previousRoute, type RouteNavigate } from '../../nav-intent/useRoutePath.js';
import { useNavIntentEntry, clearNavIntent } from '../../nav-intent/store.js';
import { PageFrame } from '../page-frame/index.js';
import { DailyCashBook } from '../reports/DailyCashBook.js';
import { AccountDrawers, type AccountDrawer } from './AccountDrawers.js';
import { AccountPage } from './AccountPage.js';
import { AccountsList } from './AccountsList.js';
import { TransfersView } from './TransfersView.js';
import type { AccountRow } from './accountsModel.js';

type AccountsTab = 'accounts' | 'cash-book' | 'transfers';

const TABS_ID = 'accounts';
const TABS: TabItem[] = [
  { id: 'accounts', label: 'Accounts', concept: 'accounts' },
  { id: 'cash-book', label: 'Daily cash book', concept: 'daily-cash-book' },
  { id: 'transfers', label: 'Transfers', concept: 'transfers' },
];

export interface AccountsPanelProps {
  selectedStation: any | null;
  /** The current route: `/accounts`, or one account's page `/accounts/<id>?from=&to=` (#576). */
  route: string;
  /** The shell's navigation (`useRoutePath`), so the account page is a real address. */
  onNavigate: RouteNavigate;
}

/** The nearest scrolling ancestor: the shell's content canvas. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/** An open drawer or modal dialog: Alt+← there is not the page's to take. */
const OPEN_OVERLAY = '.drawer-container, [role="dialog"][aria-modal="true"]';
const inOverlay = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('[role="dialog"], .drawer-container');

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Accounts (#530): tabs Accounts · Daily cash book · Transfers on the Page
 * Frame. Accounts is a balance list; a row opens that account's own page,
 * `/accounts/<id>` (#576), so back, forward, reload and a shared link work.
 * Coming back to the list keeps its tab and scroll position.
 * `{ openAccountsTab }` opens a tab; `{ openAccountId }` is a navigation to
 * the account's route (`navTarget`).
 */
export const AccountsPanel: React.FC<AccountsPanelProps> = ({
  selectedStation,
  route,
  onNavigate,
}) => {
  const stationId: string | null = selectedStation?.id ?? null;
  const timeZone: string | undefined = selectedStation?.settings?.timezone;
  // Bank work is an Office Record: default to the Entry Date, never the sales day (ADR 0005).
  const today = resolveEntryDate({ timeZone });

  const accountsQ = useFinancialAccounts(stationId);
  const accounts = useMemo<AccountRow[]>(() => accountsQ.data ?? [], [accountsQ.data]);

  const accountPath = parseAccountRoute(route);
  const accountId = accountPath?.accountId ?? null;
  const selected = accountId ? (accounts.find((a) => a.id === accountId) ?? null) : null;
  // An id that matches no account of this station once the list has loaded.
  const notFound = !!accountId && !selected && accountsQ.isSuccess;

  // A deep link to a tab (Dashboard "Daily cash book ›") is taken once per
  // publish: the intent's token guards a copy into the page's own tab state,
  // made during render so the first paint is right. An effect then clears the
  // intent from the store, so the operator's own picks are never overridden by
  // a stale link. The tab survives a visit to an account's page and back.
  const { intent, token: intentToken } = useNavIntentEntry();
  const [activeTab, setPickedTab] = useState<AccountsTab>('accounts');
  const [takenToken, setTakenToken] = useState<number | null>(null);
  const tabIntent = intent?.openAccountsTab;
  if (tabIntent && takenToken !== intentToken) {
    setTakenToken(intentToken);
    setPickedTab(tabIntent);
  }
  // `{ openAccountId }` is turned into the account's route by the shell
  // (`navTarget`); one published straight to the store is followed here.
  const intentAccountId = intent?.openAccountId;
  useEffect(() => {
    if (intentAccountId) onNavigate(accountRoute(intentAccountId), { replace: true });
    if (tabIntent || intentAccountId) clearNavIntent();
  }, [tabIntent, intentAccountId, intentToken, onNavigate]);

  const setActiveTab = (tab: AccountsTab) => {
    clearNavIntent();
    setPickedTab(tab);
  };

  // Each drawer mounts fresh per open (keyed), so its form starts from its defaults.
  const [drawer, setDrawer] = useState<AccountDrawer | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  // A drawer belongs to the page it was opened on: leaving that page (Back,
  // another account) closes it, so it never reopens on the next account.
  const [drawerPage, setDrawerPage] = useState(accountId);
  if (drawerPage !== accountId) {
    setDrawerPage(accountId);
    setDrawer(null);
  }
  const open = (d: AccountDrawer) => {
    setDrawerKey((k) => k + 1);
    setDrawer(d);
  };

  // ---- the way back, and where the list was ----
  const rootRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const showing = useRef<string | null>(accountId);

  // The list's scroll position, kept while the list is on screen.
  useEffect(() => {
    if (accountId) return;
    const scroller = scrollParent(rootRef.current);
    if (!scroller) return;
    const onScroll = () => {
      if (showing.current === null) listScroll.current = scroller.scrollTop;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [accountId]);

  // An account's page opens at its top; the list comes back where it was.
  useLayoutEffect(() => {
    if (showing.current === accountId) return;
    showing.current = accountId;
    const scroller = scrollParent(rootRef.current);
    if (scroller) scroller.scrollTop = accountId ? 0 : listScroll.current;
  }, [accountId]);

  const openAccount = (id: string) => {
    clearNavIntent();
    onNavigate(accountRoute(id));
  };
  const backToList = useCallback(() => {
    // The list is the entry behind (opened from it, or come back to by
    // Forward): step back, so Forward still works. Otherwise replace.
    if (previousRoute() === ROUTES.accounts) window.history.back();
    else onNavigate(ROUTES.accounts, { replace: true });
  }, [onNavigate]);

  // Alt+← goes back to the list, as the back link does (not while typing:
  // there it moves the caret).
  useEffect(() => {
    // Not while one of the page's drawers is open: Alt+← there is the drawer's.
    if (!accountId || drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== 'ArrowLeft' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.defaultPrevented || isEditable(e.target) || inOverlay(e.target)) return;
      if (document.querySelector(OPEN_OVERLAY)) return;
      e.preventDefault();
      backToList();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accountId, drawer, backToList]);

  // ---- the statement period, kept in the account's route ----
  const month = useMemo(() => computeRange('this-month', { timeZone }), [timeZone]);
  const range: DateRange = accountPath?.range ?? month;
  const setRange = (next: DateRange) => {
    if (!accountId) return;
    const isDefault = next.from === month.from && next.to === month.to;
    onNavigate(accountRoute(accountId, isDefault ? null : next), { replace: true });
  };

  // The same page actions on every tab (#530 review); an account's own
  // actions are on its page.
  const actions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Icon name="plus" size="sm" />}
        onClick={() => open('create')}
      >
        New account
      </Button>
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Icon name="arrow-left-right" size="sm" />}
        onClick={() => open('transfer')}
        disabled={accounts.length < 2}
      >
        New transfer
      </Button>
    </>
  );

  return (
    <div ref={rootRef}>
      {accountId ? (
        <AccountPage
          key={accountId}
          account={selected}
          accountsQuery={accountsQ}
          notFound={notFound}
          back={{ label: 'Accounts', href: `#${ROUTES.accounts}`, onClick: backToList }}
          range={range}
          onRangeChange={setRange}
          selectedStation={selectedStation}
          onAddEntry={() => open('entry')}
          onSettle={() => open('settle')}
        />
      ) : (
        <PageFrame
          route={ROUTES.accounts}
          subtitle="Cash, bank, petty cash and card/UPI clearing balances."
          actions={actions}
          tabs={
            <Tabs
              id={TABS_ID}
              aria-label="Accounts"
              activeId={activeTab}
              onChange={(id) => setActiveTab(id as AccountsTab)}
              tabs={TABS}
            />
          }
        >
          <div {...tabPanelProps(TABS_ID, activeTab)}>
            {activeTab === 'cash-book' ? (
              <DailyCashBook selectedStation={selectedStation} />
            ) : activeTab === 'transfers' ? (
              <TransfersView selectedStation={selectedStation} />
            ) : (
              <AccountsList
                accounts={accounts}
                query={accountsQ}
                onOpen={(a) => openAccount(a.id)}
              />
            )}
          </div>
        </PageFrame>
      )}

      <AccountDrawers
        key={drawerKey}
        drawer={drawer}
        onClose={() => setDrawer(null)}
        stationId={stationId}
        today={today}
        accounts={accounts}
        selected={selected}
      />
    </div>
  );
};
