import React, { useMemo, useState } from 'react';
import { resolveEntryDate } from '@pump/shared';
import { Button, Icon, Tabs, tabPanelProps, type TabItem } from '../../pump-ds/index.js';
import { useFinancialAccounts } from '../../query/hooks.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { useNavIntent, clearNavIntent } from '../../nav-intent/store.js';
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

  // A deep link (Dashboard "Daily cash book ›", Reports › Cash & bank) is derived
  // from the intent until the operator acts, then the page's own state takes over.
  const intent = useNavIntent();
  const [pickedTab, setPickedTab] = useState<AccountsTab>('accounts');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const activeTab: AccountsTab = intent?.openAccountId
    ? 'accounts'
    : (intent?.openAccountsTab ?? pickedTab);
  const selectedId = intent?.openAccountId ?? pickedId;
  const selected =
    activeTab === 'accounts' ? (accounts.find((a) => a.id === selectedId) ?? null) : null;

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

  const transferButton = (primary: boolean) => (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      size="sm"
      leftIcon={<Icon name="arrow-left-right" size="sm" />}
      onClick={() => open('transfer')}
      disabled={accounts.length < 2}
    >
      {primary ? 'New transfer' : 'Transfer'}
    </Button>
  );

  // One primary button per view; the Daily cash book is a read view.
  const actions = selected ? (
    <>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Icon name="arrow-left" size="sm" />}
        onClick={() => openAccount(null)}
      >
        All accounts
      </Button>
      <Button
        variant={selected.accountType === 'MERCHANT_CLEARING' ? 'secondary' : 'primary'}
        size="sm"
        leftIcon={<Icon name="plus" size="sm" />}
        onClick={() => open('entry')}
      >
        Add entry
      </Button>
      {selected.accountType === 'MERCHANT_CLEARING' && (
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Icon name="banknote" size="sm" />}
          onClick={() => open('settle')}
        >
          Settle to bank
        </Button>
      )}
    </>
  ) : activeTab === 'accounts' ? (
    <>
      {transferButton(false)}
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Icon name="plus" size="sm" />}
        onClick={() => open('create')}
      >
        New account
      </Button>
    </>
  ) : activeTab === 'transfers' ? (
    transferButton(true)
  ) : undefined;

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
            <AccountStatement
              key={selected.id}
              account={selected}
              selectedStation={selectedStation}
            />
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
