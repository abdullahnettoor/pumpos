import React, { useMemo, useState } from 'react';
import { useCustomerLedger } from '@pump/ui';
import { buildStatement, STATEMENT_PAGE, type LedgerRow } from '../../lib/money/statement.js';
import { balanceOf, type MoneyCustomer } from '../../lib/money/parties.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { PhoneIcon } from '../../ui/icons.js';
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { BalanceCard } from './BalanceCard.js';
import { StatementList } from './StatementList.js';
import { useCustomersData } from './useMoneyData.js';

/** Call button: a real `tel:` link, styled like the header `IconButton`. */
const CallButton: React.FC<{ name: string; phone: string }> = ({ name, phone }) => (
  <a
    href={`tel:${phone.replace(/[^\d+]/g, '')}`}
    aria-label={`Call ${name}`}
    className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] border border-line bg-card text-text-muted"
  >
    <PhoneIcon size={17} />
  </a>
);

/**
 * Customer page: header (type, fleet code, phone, call), balance card and the
 * statement. Built from the customers list and the customer ledger only.
 *
 * Seams for the tickets that own what is missing here:
 *  - #398 (receivables summary): aging, last payment, usually pays in and
 *    vehicle spend go between `BalanceCard` and the Statement.
 *  - #400 (statement PDF): pass `share` / `download` to `DetailPage`; with
 *    neither, no action bar is shown.
 *  - #413 (ranged ledger): replaces `useCustomerLedger` + the all-time
 *    `buildStatement` accumulation with server-side opening balance, ranges
 *    and paging.
 */
export const CustomerPage: React.FC<{ customer: MoneyCustomer }> = ({ customer: initial }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { customers } = useCustomersData();
  const customer = customers.find((c) => c.id === initial.id) ?? initial;

  const ledgerQ = useCustomerLedger(customer.id);
  const [visible, setVisible] = useState(STATEMENT_PAGE);
  const statement = useMemo(
    () => buildStatement((ledgerQ.data ?? []) as LedgerRow[], visible, balanceOf(customer)),
    [ledgerQ.data, visible, customer],
  );

  const subtitle = [customer.customerType, customer.fleetCode, customer.phone]
    .filter(Boolean)
    .join(' · ');

  return (
    <DetailPage
      title={customer.name}
      subtitle={subtitle || undefined}
      right={
        customer.phone ? <CallButton name={customer.name} phone={customer.phone} /> : undefined
      }
    >
      <BalanceCard customer={customer} />
      <SectionLabel>Statement</SectionLabel>
      {ledgerQ.isLoading ? (
        <Note>Loading statement…</Note>
      ) : ledgerQ.isError ? (
        <Note>
          Couldn’t load the statement.{' '}
          <button
            type="button"
            onClick={() => void ledgerQ.refetch()}
            className="font-bold text-accent"
          >
            Retry
          </button>
        </Note>
      ) : statement.total === 0 ? (
        <Note>
          {statement.reconciled
            ? 'No transactions yet.'
            : 'No statement entries to show for this balance.'}
        </Note>
      ) : (
        <StatementList
          statement={statement}
          onLoadMore={() => setVisible((n) => n + STATEMENT_PAGE)}
        />
      )}
    </DetailPage>
  );
};
