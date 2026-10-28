import React, { useCallback, useMemo, useState } from 'react';
import { resolveEntryDate } from '@pump/shared';
import { useDailyCashBook } from '../../query/hooks.js';
import type { DailyCashBookAccount } from '../../services/cloud.js';
import { Drawer } from '../Drawer.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { AccountTypeChip } from '../finance/AccountTypeChip.js';
import { formatBusinessDate, formatMoney } from '../../utils/format.js';
import { accountTypeDetail } from '../../utils/ledgerLabels.js';
import { StatementView, buildLedgerStatement, moneyEntries } from '../../statement/index.js';
import { cashAccountTotals, sortCashBookAccounts } from '../../utils/cashBook.js';
import { DayPicker } from './DayPicker.js';
import {
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  SectionHeader,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';

export interface DailyCashBookProps {
  selectedStation: any | null;
}

const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** A balance below zero is a problem (an overdrawn account), so it alone reads red. */
const Balance: React.FC<{ value: number }> = ({ value }) => (
  <span className={value < 0 ? 'text-danger-fg' : undefined}>{formatMoney(value)}</span>
);

/** Money that moved, plain; a side that did not move reads "—". */
const Moved: React.FC<{ value: number }> = ({ value }) =>
  value ? <>{formatMoney(value)}</> : <span className="text-ink-faint">—</span>;

const COLUMNS: TableColumn<DailyCashBookAccount>[] = [
  {
    id: 'account',
    header: 'Account',
    kind: 'text',
    value: (a) => a.name,
    cell: (a) => (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-semibold text-ink-strong">{a.name}</span>
        {accountTypeDetail(a.name, a.accountType) && <AccountTypeChip type={a.accountType} />}
        {a.entries.length > 0 && (
          <span className="text-[12px] text-ink-muted">{entries(a.entries.length)}</span>
        )}
      </span>
    ),
  },
  {
    id: 'opening',
    header: 'Opening',
    kind: 'money',
    value: (a) => a.opening,
    cell: (a) => <Balance value={Number(a.opening)} />,
    width: '15%',
  },
  {
    id: 'moneyIn',
    header: 'In',
    kind: 'money',
    value: (a) => a.moneyIn,
    cell: (a) => <Moved value={Number(a.moneyIn)} />,
    width: '15%',
  },
  {
    id: 'moneyOut',
    header: 'Out',
    kind: 'money',
    value: (a) => a.moneyOut,
    cell: (a) => <Moved value={Number(a.moneyOut)} />,
    width: '15%',
  },
  {
    id: 'closing',
    header: 'Closing',
    kind: 'money',
    value: (a) => a.closing,
    cell: (a) => <Balance value={Number(a.closing)} />,
    width: '15%',
  },
];

/**
 * Daily Cash Book (ADR 0005): each Financial Account's opening, money in, money
 * out and closing on one station-calendar date, computed live from the ledger.
 * The day picker sits in the book's header, directly above it; the cash total
 * (Cash in Hand + Petty Cash) closes the table. Click an account to see that
 * day's entries.
 */
export const DailyCashBook: React.FC<DailyCashBookProps> = ({ selectedStation }) => {
  const timeZone: string | undefined = selectedStation?.settings?.timezone;
  const today = resolveEntryDate({ timeZone });
  const [date, setDate] = useState<string>(today);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  const cashBookQ = useDailyCashBook(selectedStation?.id, date);

  const accounts = useMemo(
    () => sortCashBookAccounts(cashBookQ.data?.accounts ?? []),
    [cashBookQ.data],
  );
  const hasCashAccounts = accounts.some(
    (a) => a.accountType === 'CASH_IN_HAND' || a.accountType === 'PETTY_CASH',
  );
  // The cash total, from the server's figures; it leaves the bank and clearing accounts out.
  const totalRow = useMemo<TotalRow | undefined>(() => {
    if (!hasCashAccounts) return undefined;
    const cash = cashAccountTotals(accounts);
    return {
      label: 'Cash total (Cash in Hand + Petty Cash)',
      values: {
        opening: cash.opening,
        moneyIn: cash.moneyIn,
        moneyOut: cash.moneyOut,
        closing: cash.closing,
      },
    };
  }, [accounts, hasCashAccounts]);
  const openAccount = accounts.find((a) => a.id === openAccountId) ?? null;

  const timeOf = useCallback(
    (iso: string) =>
      new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: timeZone || 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [timeZone],
  );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Daily cash book"
        subtitle={formatBusinessDate(date)}
        controls={{
          range: (
            <DayPicker value={date} onChange={setDate} max={today} aria-label="Cash book date" />
          ),
          info: (
            <InfoTip label="About the daily cash book" placement="bottom">
              Office money by entry date (the station&apos;s calendar day). Shift cash lands on the
              date the shift was closed.
            </InfoTip>
          ),
        }}
      />
      <DataSection
        title="the cash book"
        query={cashBookQ}
        placeholderHeight={240}
        flush
        isEmpty={accounts.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="book-open" size="md" />}
              title="No accounts yet"
              description="Set up Cash in Hand and your bank accounts under Accounts to see a daily cash book."
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={COLUMNS}
          rows={accounts}
          rowKey={(a) => a.id}
          totalRow={totalRow}
          title="the cash book"
          onRowClick={(a) => setOpenAccountId(a.id)}
          rowLabel={(a) => `${a.name} entries`}
        />
      </DataSection>

      <Drawer
        isOpen={!!openAccount}
        onClose={() => setOpenAccountId(null)}
        widthVariant="wide"
        title={openAccount ? `${openAccount.name} · ${formatBusinessDate(date)}` : 'Entries'}
      >
        {openAccount && (
          <AccountDayEntries
            account={openAccount}
            date={date}
            timeOf={timeOf}
            key={openAccount.id}
          />
        )}
      </Drawer>
    </section>
  );
};

/**
 * One account's entries for the date, as a statement (Statement module):
 * opening, each entry as a Debit (in) or Credit (out) with its running
 * balance, and the closing. The time and the party or note sit under the source.
 *
 * Every entry belongs to the book's date (its Entry Date), so each row carries
 * it: a back-dated record recorded days later still sits in this book.
 */
const AccountDayEntries: React.FC<{
  account: DailyCashBookAccount;
  /** The book's Entry Date, `YYYY-MM-DD`. */
  date: string;
  timeOf: (iso: string) => string;
}> = ({ account, date, timeOf }) => {
  const statement = useMemo(
    () =>
      buildLedgerStatement(
        moneyEntries(
          account.entries.map((e) => ({ ...e, entryDate: date })),
          {
            detail: (e) =>
              [e.createdAt && timeOf(e.createdAt), e.partyName, e.notes]
                .filter(Boolean)
                .join(' · '),
          },
        ),
        // The server's opening, money in / out and closing, checked against the entries.
        {
          kind: 'account',
          opening: account.opening,
          closing: account.closing,
          totals: { debit: account.moneyIn, credit: account.moneyOut },
        },
      ),
    [account, date, timeOf],
  );
  return (
    <div className="flex flex-col gap-3">
      {accountTypeDetail(account.name, account.accountType) && (
        <div className="flex items-center gap-2">
          <AccountTypeChip type={account.accountType} />
        </div>
      )}
      <StatementView statement={statement} label={`${account.name} entries`} scrollToEnd />
    </div>
  );
};
