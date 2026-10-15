import React, { useMemo, useState } from 'react';
import { useFinanceMovements } from '../../../query/hooks.js';
import type { NavIntent } from '../../../nav-intent/store.js';
import { ROUTES } from '../../../nav-intent/routes.js';
import { formatCompactMoney, formatMoney } from '../../../utils/format.js';
import { accountTypeDetail } from '../../../utils/ledgerLabels.js';
import { countOf } from '../../../utils/ledgerWindow.js';
import { useRunTask } from '../../../utils/runTask.js';
import { InfoTip } from '../../primitives/InfoTip.js';
import {
  DataSection,
  EmptyState,
  ExportMenu,
  FilterChips,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  computeRange,
  type DateRange,
  type TableColumn,
} from '../../../pump-ds/index.js';
import { ReportRangeBar } from '../ReportRangeBar.js';
import {
  buildCashBankSummary,
  type CashBankAccountRow,
  type CashBankGroupSummary,
} from './cashBankSummary.js';
import { groupTotalLabel } from './labels.js';

export interface CashBankReportProps {
  selectedStation: any | null;
  /** Opens an account's statement on Accounts. Without it the rows don't open. */
  onNavigate?: (path: string, intent?: NavIntent) => void;
}

type Shown = 'active' | 'all';

/** A closing below zero is the one problem on this table: red, nothing else is coloured. */
const closingCell = (closing: number) => (
  <span className={closing < 0 ? 'text-danger-fg' : undefined}>{formatMoney(closing)}</span>
);

const COLUMNS: TableColumn<CashBankAccountRow>[] = [
  {
    id: 'account',
    header: 'Account',
    kind: 'text',
    width: '36%',
    value: (a) => a.accountName,
    cell: (a) => {
      const detail = accountTypeDetail(a.accountName, a.accountType);
      return (
        <span className="flex flex-col leading-tight">
          <span className="font-medium text-ink-strong">{a.accountName}</span>
          {(detail || !a.isActive) && (
            <span className="text-[12px] text-ink-muted">
              {[detail, a.isActive ? null : 'Inactive'].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      );
    },
  },
  { id: 'opening', header: 'Opening', kind: 'money', value: (a) => a.opening },
  { id: 'in', header: 'In', kind: 'money', value: (a) => a.moneyIn },
  { id: 'out', header: 'Out', kind: 'money', value: (a) => a.moneyOut },
  {
    id: 'closing',
    header: 'Closing',
    kind: 'money',
    value: (a) => a.closing,
    cell: (a) => closingCell(a.closing),
  },
];

/**
 * Reports › Ledgers › Cash & bank (#531, owner decision 14 Oct): a per-account
 * summary of the money ledger for the range. One row per account (Opening ·
 * In · Out · Closing), a Cash and a Bank total that leave out transfers inside
 * the group, and the Cash + Bank figures in the tiles. CMS, card/UPI clearing
 * and Owner accounts sit apart, collapsed, outside Cash + Bank. A row opens
 * that account's statement on Accounts; there is no merged running balance.
 *
 * Layout A: one control bar drives the tiles and the tables.
 */
export const CashBankReport: React.FC<CashBankReportProps> = ({ selectedStation, onNavigate }) => {
  const s = selectedStation?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [shown, setShown] = useState<Shown>('active');
  const [otherOpen, setOtherOpen] = useState(false);
  const runTask = useRunTask();

  const ledgerQ = useFinanceMovements({
    stationId: selectedStation?.id,
    from: range.from,
    to: range.to,
  });
  const summary = useMemo(
    () => buildCashBankSummary(ledgerQ.data, { showAll: shown === 'all' }),
    [ledgerQ.data, shown],
  );
  const accountCount =
    summary.cash.accounts.length + summary.bank.accounts.length + summary.other.accounts.length;
  const cashBankCount = summary.cash.accounts.length + summary.bank.accounts.length;
  const movedBetween =
    summary.cash.internalTransfers + summary.bank.internalTransfers + summary.deposited;

  const openAccount = onNavigate
    ? (a: CashBankAccountRow) => onNavigate(ROUTES.accounts, { openAccountId: a.accountId })
    : undefined;

  const exportPdf = (output: 'save' | 'print') =>
    runTask(
      import('./cashBankPdf.js').then(({ generateCashBankPdf }) =>
        generateCashBankPdf(selectedStation, summary, range, output),
      ),
      output === 'print' ? 'Could not print the summary.' : 'Could not export the summary.',
    );

  const groupSection = (title: string, g: CashBankGroupSummary) => (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title={title}
        subtitle={
          g.accounts.length > 0 ? countOf(g.shown.length, 'account', 'accounts') : undefined
        }
      />
      <DataSection
        title={`${title.toLowerCase()} accounts`}
        query={ledgerQ}
        placeholderHeight={120}
        flush
        isEmpty={g.shown.length === 0}
        empty={
          <p className="m-0 px-4 py-3 text-[12px] text-ink-muted">
            {g.accounts.length === 0
              ? `No ${title.toLowerCase()} accounts at this station.`
              : `No ${title.toLowerCase()} account moved or holds money in this range.`}
          </p>
        }
      >
        <InteractiveTable
          bare
          columns={COLUMNS}
          rows={g.shown}
          rowKey={(a) => a.accountId}
          title={`${title.toLowerCase()} accounts`}
          onRowClick={openAccount}
          rowLabel={openAccount ? (a) => `${a.accountName} statement` : undefined}
          totalRow={{
            label: groupTotalLabel(g),
            values: {
              opening: g.totals.opening,
              in: g.totals.moneyIn,
              out: g.totals.moneyOut,
              closing: g.totals.closing,
            },
          }}
        />
      </DataSection>
    </section>
  );

  if (!selectedStation) {
    return (
      <p className="m-0 p-6 text-[13px] text-ink-muted">
        Select a station to see its cash and bank accounts.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        filters={
          summary.idle > 0 ? (
            <FilterChips<Shown>
              aria-label="Accounts shown"
              value={shown}
              onChange={setShown}
              options={[
                { value: 'active', label: 'With activity', count: accountCount - summary.idle },
                { value: 'all', label: 'All accounts', count: accountCount },
              ]}
            />
          ) : undefined
        }
        exportMenu={
          <ExportMenu
            onPdf={() => exportPdf('save')}
            onPrint={() => exportPdf('print')}
            disabled={!ledgerQ.data || cashBankCount === 0}
          />
        }
        info={
          <InfoTip label="About the cash and bank summary" placement="bottom">
            Every account&rsquo;s money in and out over the range, from the money ledger (shift
            cash, collections, expenses, transfers and settlements). Opening is the account&rsquo;s
            balance before the range; closing = opening + in − out. The Cash and Bank totals leave
            out transfers between two accounts of the same group, and Cash + Bank leaves out every
            transfer between its accounts; a cash deposit to the bank counts in both groups. Open an
            account for its statement.
          </InfoTip>
        }
      />

      <DataSection
        title="Cash and bank totals"
        query={ledgerQ}
        shape="cards"
        placeholderHeight={90}
      >
        <KpiStrip columns="auto" scope="in-range">
          <KpiTile
            label="Opening"
            value={formatMoney(summary.total.opening)}
            hint="Cash + Bank"
            alert={summary.total.opening < 0 ? 'danger' : undefined}
          />
          <KpiTile
            label="Money in"
            value={formatMoney(summary.total.moneyIn)}
            hint={
              movedBetween > 0
                ? `excl. ${formatCompactMoney(movedBetween)} moved between them`
                : 'Cash + Bank'
            }
          />
          <KpiTile
            label="Money out"
            value={formatMoney(summary.total.moneyOut)}
            hint={
              summary.deposited > 0
                ? `${formatCompactMoney(summary.deposited)} cash banked`
                : 'Cash + Bank'
            }
          />
          <KpiTile
            label="Closing"
            value={formatMoney(summary.total.closing)}
            hint="Cash + Bank"
            alert={summary.total.closing < 0 ? 'danger' : undefined}
          />
        </KpiStrip>
      </DataSection>

      {ledgerQ.data && cashBankCount === 0 ? (
        <DataSection title="Cash and bank accounts" placeholderHeight={120}>
          <EmptyState
            compact
            icon={<Icon name="wallet" size="md" />}
            title="No cash or bank accounts yet"
            description="Add the station's cash and bank accounts on the Accounts page."
          />
        </DataSection>
      ) : (
        <>
          {groupSection('Cash', summary.cash)}
          {groupSection('Bank', summary.bank)}
        </>
      )}

      {summary.other.accounts.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Other accounts"
            subtitle={`CMS, card/UPI clearing and owner · not in Cash + Bank · ${countOf(
              summary.other.shown.length,
              'account',
              'accounts',
            )}`}
            action={{ label: otherOpen ? 'Hide' : 'Show', onClick: () => setOtherOpen((v) => !v) }}
          />
          {otherOpen && (
            <DataSection
              title="other accounts"
              query={ledgerQ}
              placeholderHeight={100}
              flush
              isEmpty={summary.other.shown.length === 0}
              empty={
                <p className="m-0 px-4 py-3 text-[12px] text-ink-muted">
                  None of these accounts moved or holds money in this range.
                </p>
              }
            >
              <InteractiveTable
                bare
                columns={COLUMNS}
                rows={summary.other.shown}
                rowKey={(a) => a.accountId}
                title="other accounts"
                onRowClick={openAccount}
                rowLabel={openAccount ? (a) => `${a.accountName} statement` : undefined}
                totalRow={{
                  label: groupTotalLabel(summary.other),
                  values: {
                    opening: summary.other.totals.opening,
                    in: summary.other.totals.moneyIn,
                    out: summary.other.totals.moneyOut,
                    closing: summary.other.totals.closing,
                  },
                }}
              />
            </DataSection>
          )}
        </section>
      )}
    </div>
  );
};
