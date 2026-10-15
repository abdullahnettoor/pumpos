import React from 'react';
import {
  Button,
  DataSection,
  EmptyState,
  Icon,
  type BackLinkProps,
  type DateRange,
} from '../../pump-ds/index.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { formatMoney } from '../../utils/format.js';
import { accountTypeDetail } from '../../utils/ledgerLabels.js';
import { PageFrame } from '../page-frame/index.js';
import { AccountStatement } from './AccountStatement.js';
import { AccountTypeChip } from './AccountTypeChip.js';
import type { AccountRow } from './accountsModel.js';

type SectionQuery = React.ComponentProps<typeof DataSection>['query'];

export interface AccountPageProps {
  /** The account, once the station's accounts have loaded and it is among them. */
  account: AccountRow | null;
  /** The station's accounts query: loading and failure show on the page. */
  accountsQuery: NonNullable<SectionQuery>;
  /** The id matched no account of this station. */
  notFound: boolean;
  /** The way back to the Accounts list. */
  back: BackLinkProps;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  selectedStation: { settings?: { timezone?: string } } | null;
  onAddEntry: () => void;
  onSettle: () => void;
}

/**
 * One Financial Account's page (#576), at `/accounts/<id>`: accountants spend
 * long stretches here, so it is a page of its own, not a drawer. "‹ Accounts"
 * top-left; the account's name and type as the title, its balance as the
 * subtitle; its own actions (Add entry, and Settle to bank for a clearing
 * account) on the title row. No Accounts tabs: the statement fills the page
 * (layout B: tiles, then the statement with its period in its header).
 */
export const AccountPage: React.FC<AccountPageProps> = ({
  account,
  accountsQuery,
  notFound,
  back,
  range,
  onRangeChange,
  selectedStation,
  onAddEntry,
  onSettle,
}) => {
  if (notFound) {
    return (
      <PageFrame route={ROUTES.accounts} title="Account not found" back={back}>
        <EmptyState
          icon={<Icon name="wallet" size="md" />}
          title="This account isn't available"
          description="It may have been removed, or it belongs to another station."
          action={
            <Button variant="secondary" size="sm" onClick={back.onClick}>
              Go to Accounts
            </Button>
          }
        />
      </PageFrame>
    );
  }

  if (!account) {
    return (
      <PageFrame route={ROUTES.accounts} title="Account" back={back}>
        <DataSection title="account" query={accountsQuery} enabled placeholderHeight={240}>
          {null}
        </DataSection>
      </PageFrame>
    );
  }

  const balance = Number(account.balance || 0);
  const overdrawn = balance < 0;
  const typeDetail = accountTypeDetail(account.name, account.accountType);

  return (
    <PageFrame
      route={ROUTES.accounts}
      back={back}
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{account.name}</span>
          {typeDetail && <AccountTypeChip type={account.accountType} />}
        </span>
      }
      subtitle={
        <>
          Balance{' '}
          <span className={overdrawn ? 'font-mono text-danger-fg' : 'font-mono text-ink-default'}>
            {formatMoney(balance)}
          </span>
          {overdrawn && <span className="text-danger-fg"> · overdrawn</span>}
        </>
      }
      actions={
        <>
          {account.accountType === 'MERCHANT_CLEARING' && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="banknote" size="sm" />}
              onClick={onSettle}
            >
              Settle to bank
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Icon name="plus" size="sm" />}
            onClick={onAddEntry}
          >
            Add entry
          </Button>
        </>
      }
    >
      <AccountStatement
        account={account}
        selectedStation={selectedStation}
        range={range}
        onRangeChange={onRangeChange}
        showBalance={false}
      />
    </PageFrame>
  );
};
