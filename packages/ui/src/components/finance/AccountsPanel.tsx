import React, { useEffect, useMemo, useState } from 'react';
import { resolveEntryDate } from '@pump/shared';
import {
  Button,
  EmptyState,
  Icon,
  Tabs,
  tabPanelProps,
  type TabItem,
} from '../../pump-ds/index.js';
import { useFinancialAccounts } from '../../query/hooks.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { useNavIntentEntry, clearNavIntent } from '../../nav-intent/store.js';
import { accountTypeDetail } from '../../utils/ledgerLabels.js';
import { PageFrame } from '../page-frame/index.js';
import { DailyCashBook } from '../reports/DailyCashBook.js';
import { AccountDrawers, type AccountDrawer } from './AccountDrawers.js';
import { AccountStatement } from './AccountStatement.js';
import { AccountTypeChip } from './AccountTypeChip.js';
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
}

/**
 * Accounts (#530): tabs Accounts · Daily cash book · Transfers on the Page
 * Frame. Accounts is a balance list; a row opens that account's statement in
 * place, with the tabs still one click away. `{ openAccountId }` opens a
 * statement from another page, `{ openAccountsTab }` a tab.
 */
export const AccountsPanel: React.FC<AccountsPanelProps> = ({ selectedStation }) => {
  const stationId: string | null = selectedStation?.id ?? null;
  const timeZone: string | undefined = selectedStation?.settings?.timezone;
  // Bank work is an Office Record: default to the Entry Date, never the sales day (ADR 0005).
  const today = resolveEntryDate({ timeZone });

  const accountsQ = useFinancialAccounts(stationId);
  const accounts = useMemo<AccountRow[]>(() => accountsQ.data ?? [], [accountsQ.data]);

  // A deep link (Dashboard "Daily cash book ›", Reports › Cash & bank) is taken
  // once per publish: the intent's token guards a copy into the page's own tab /
  // account state, made during render so the first paint is right. An effect
  // then clears the intent from the store, so leaving and coming back shows the
  // list, and the operator's own picks are never overridden by a stale link.
  const { intent, token: intentToken } = useNavIntentEntry();
  const [pickedTab, setPickedTab] = useState<AccountsTab>('accounts');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [takenToken, setTakenToken] = useState<number | null>(null);
  const forUs = !!(intent?.openAccountId || intent?.openAccountsTab);
  if (forUs && takenToken !== intentToken) {
    setTakenToken(intentToken);
    setPickedTab(intent?.openAccountId ? 'accounts' : (intent?.openAccountsTab ?? 'accounts'));
    setPickedId(intent?.openAccountId ?? null);
  }
  useEffect(() => {
    if (forUs) clearNavIntent();
  }, [forUs, intentToken]);
  const activeTab = pickedTab;
  const selectedId = activeTab === 'accounts' ? pickedId : null;
  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  // An id that matches no account once the list has loaded (a stale link).
  const notFound = !!selectedId && !selected && accountsQ.isSuccess;

  const setActiveTab = (tab: AccountsTab) => {
    clearNavIntent();
    setPickedId(null);
    setPickedTab(tab);
  };
  const openAccount = (id: string | null) => {
    clearNavIntent();
    setPickedTab('accounts');
    setPickedId(id);
  };

  // Each drawer mounts fresh per open (keyed), so its form starts from its defaults.
  const [drawer, setDrawer] = useState<AccountDrawer | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const open = (d: AccountDrawer) => {
    setDrawerKey((k) => k + 1);
    setDrawer(d);
  };

  // The same page actions on every tab (#530 review); actions on one account
  // sit in its statement's header.
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

  const statementActions = selected && (
    <>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Icon name="plus" size="sm" />}
        onClick={() => open('entry')}
      >
        Add entry
      </Button>
      {selected.accountType === 'MERCHANT_CLEARING' && (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Icon name="banknote" size="sm" />}
          onClick={() => open('settle')}
        >
          Settle to bank
        </Button>
      )}
    </>
  );

  const backButton = (
    <div>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Icon name="arrow-left" size="sm" />}
        onClick={() => openAccount(null)}
      >
        All accounts
      </Button>
    </div>
  );

  const typeDetail = selected && accountTypeDetail(selected.name, selected.accountType);

  return (
    <>
      <PageFrame
        route={ROUTES.accounts}
        title={selected ? selected.name : undefined}
        subtitle={
          selected ? (
            <span className="inline-flex items-center gap-2">
              {typeDetail && <AccountTypeChip type={selected.accountType} />}
              Account statement
            </span>
          ) : (
            'Cash, bank, petty cash and card/UPI clearing balances.'
          )
        }
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
          ) : selected ? (
            <div className="flex flex-col gap-3">
              {backButton}
              <AccountStatement
                key={selected.id}
                account={selected}
                selectedStation={selectedStation}
                actions={statementActions}
              />
            </div>
          ) : notFound ? (
            <div className="flex flex-col gap-3">
              {backButton}
              <EmptyState
                icon={<Icon name="wallet" size="md" />}
                title="Account not found"
                description="It may have been removed, or it belongs to another station."
              />
            </div>
          ) : (
            <AccountsList accounts={accounts} query={accountsQ} onOpen={(a) => openAccount(a.id)} />
          )}
        </div>
      </PageFrame>

      <AccountDrawers
        key={drawerKey}
        drawer={drawer}
        onClose={() => setDrawer(null)}
        stationId={stationId}
        today={today}
        accounts={accounts}
        selected={selected}
      />
    </>
  );
};
