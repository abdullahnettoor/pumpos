import React, { useMemo } from 'react';
import {
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  StatusChip,
  type SectionQuery,
  type TableColumn,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { AccountTypeChip } from './AccountTypeChip.js';
import { accountBalances, type AccountRow } from './accountsModel.js';

/** A balance below zero is a problem (an overdrawn account), so it alone reads red. */
const BalanceCell: React.FC<{ value: number }> = ({ value }) => (
  <span className={value < 0 ? 'text-danger-fg' : 'text-ink-strong'}>{formatMoney(value)}</span>
);

const COLUMNS: TableColumn<AccountRow>[] = [
  {
    id: 'name',
    header: 'Account',
    kind: 'text',
    value: (a) => a.name,
    cell: (a) => (
      <span className="inline-flex items-center gap-2">
        <span className="font-semibold text-ink-strong">{a.name}</span>
        {a.isActive === false && <StatusChip status="inactive" size="md" />}
      </span>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    kind: 'text',
    value: (a) => a.accountType,
    cell: (a) => <AccountTypeChip type={a.accountType} />,
    width: '30%',
  },
  {
    id: 'balance',
    header: 'Balance',
    kind: 'money',
    value: (a) => a.balance,
    cell: (a) => <BalanceCell value={Number(a.balance || 0)} />,
    width: '22%',
  },
];

export interface AccountsListProps {
  accounts: AccountRow[];
  query: SectionQuery;
  onOpen: (account: AccountRow) => void;
}

/**
 * Accounts › Accounts (#530), a balance list on layout B: the live balance
 * tiles (Now), then every account with its type and balance. A row opens the
 * account's statement.
 */
export const AccountsList: React.FC<AccountsListProps> = ({ accounts, query, onOpen }) => {
  const balances = useMemo(() => accountBalances(accounts), [accounts]);
  return (
    <div className="flex flex-col gap-4">
      <DataSection
        title="account balances"
        query={query}
        shape="cards"
        placeholderHeight={90}
        isEmpty={accounts.length === 0}
        empty={null}
      >
        <KpiStrip columns="auto">
          <KpiTile
            label="Cash"
            scope="now"
            value={formatMoney(balances.cash)}
            alert={balances.cash < 0 ? 'danger' : undefined}
            hint="in hand + petty"
          />
          <KpiTile
            label="Bank"
            scope="now"
            value={formatMoney(balances.bank)}
            alert={balances.bank < 0 ? 'danger' : undefined}
          />
          <KpiTile
            label="Card/UPI clearing"
            scope="now"
            value={formatMoney(balances.clearing)}
            hint="awaiting settlement"
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Accounts"
          subtitle={
            query.isPending || query.isError
              ? undefined
              : `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`
          }
          controls={{
            info: (
              <InfoTip label="About account balances" placement="bottom">
                Live balances from the money ledger. Cash in Hand and Bank appear on their own once
                money is posted to them; create petty cash, owner, clearing or more bank accounts
                with “New account”. Open an account for its statement.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="accounts"
          query={query}
          placeholderHeight={240}
          flush
          isEmpty={accounts.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="wallet" size="md" />}
                title="No accounts yet"
                description="Create a bank, petty-cash or owner account, or record a collection or expense: Cash in Hand and Bank appear on their own."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={COLUMNS}
            rows={accounts}
            rowKey={(a) => a.id}
            totalRow={{ label: 'Total, all accounts' }}
            title="accounts"
            onRowClick={onOpen}
            rowLabel={(a) => `${a.name} statement`}
          />
        </DataSection>
      </section>
    </div>
  );
};
