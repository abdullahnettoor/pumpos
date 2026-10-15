import React, { useMemo, useState } from 'react';
import {
  DataSection,
  DateRangeMenu,
  KpiStrip,
  KpiTile,
  SectionHeader,
  computeRange,
  type DateRange,
  type KpiScope,
} from '../../pump-ds/index.js';
import { useAccountLedger } from '../../query/hooks.js';
import { StatementView, buildLedgerStatement, moneyEntries } from '../../statement/index.js';
import type { MoneyMovement } from '../../statement/index.js';
import { formatMoney } from '../../utils/format.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { accountFlows, entries, type AccountRow } from './accountsModel.js';

/** An account-ledger row's second line: an OMC card sale names its customer, vehicle and litres. */
const accountEntryDetail = (e: MoneyMovement & Record<string, any>): string | null =>
  e.sourceType === 'SALE_OMC'
    ? [e.omcCustomerName, e.omcVehicle, e.omcQuantity ? `${e.omcQuantity} L` : null, e.omcNotes]
        .filter(Boolean)
        .join(' · ') ||
      e.notes ||
      'OMC card (no customer)'
    : e.notes || null;

export interface AccountStatementProps {
  /** The account, with its live balance (`GET /finance/accounts`). */
  account: AccountRow;
  /** The station, for its clock. */
  selectedStation: { settings?: { timezone?: string } } | null;
  /** Buttons that act on this account, in the statement's header (a page puts them in its own header). */
  actions?: React.ReactNode;
  /**
   * The statement period, when its owner keeps it (the account page keeps it
   * in its URL, #576). Omitted, the statement keeps its own, from this month.
   */
  range?: DateRange;
  onRangeChange?: (range: DateRange) => void;
  /**
   * Show the Balance tile. The account page shows the balance in its subtitle,
   * so it leaves the tile out rather than repeat it.
   */
  showBalance?: boolean;
}

/**
 * One Financial Account's statement (#530), layout B: the fixed tiles (its
 * balance now, money in and out this month), then the statement with its
 * period in the section header. Money in is a Debit, money out a Credit.
 *
 * Exported so other pages can show an account's statement (Reports › Cash &
 * bank, #531); to open the account's own page instead, navigate to
 * `accountRoute(id)` (#576). Key it by the account id so an uncontrolled
 * period starts at this month for each one.
 */
export const AccountStatement: React.FC<AccountStatementProps> = ({
  account,
  selectedStation,
  actions,
  range: controlledRange,
  onRangeChange,
  showBalance = true,
}) => {
  const timeZone = selectedStation?.settings?.timezone;
  // Ledger entries are dated by entry date: the plain station calendar date (ADR 0005).
  const entryClock = useMemo(() => ({ timeZone }), [timeZone]);
  const month = useMemo(() => computeRange('this-month', entryClock), [entryClock]);
  const [ownRange, setOwnRange] = useState<DateRange>(month);
  const range = controlledRange ?? ownRange;
  const setRange = onRangeChange ?? setOwnRange;

  const ledgerQ = useAccountLedger(account.id, { from: range.from, to: range.to });
  // The month the tiles read. Same key as the table at its default period, so one request.
  const monthQ = useAccountLedger(account.id, { from: month.from, to: month.to });

  const statement = useMemo(
    () =>
      buildLedgerStatement(
        moneyEntries(ledgerQ.data?.entries || [], { detail: accountEntryDetail }),
        { kind: 'account', opening: ledgerQ.data?.periodOpeningBalance ?? 0 },
      ),
    [ledgerQ.data],
  );
  const flows = useMemo(
    () => accountFlows(monthQ.data?.entries || [], month),
    [monthQ.data, month],
  );
  const balance = Number(account.balance || 0);
  const monthScope: KpiScope = { month: month.from };

  return (
    <div className="flex flex-col gap-4">
      <DataSection title="account totals" query={monthQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          {showBalance && (
            <KpiTile
              label="Balance"
              scope="now"
              value={formatMoney(balance)}
              alert={balance < 0 ? 'danger' : undefined}
              hint={balance < 0 ? 'overdrawn' : undefined}
            />
          )}
          <KpiTile label="Money in" scope={monthScope} value={formatMoney(flows.moneyIn)} />
          <KpiTile label="Money out" scope={monthScope} value={formatMoney(flows.moneyOut)} />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Statement"
          subtitle={ledgerQ.data ? entries(statement.rows.length) : undefined}
          controls={{
            range: (
              <DateRangeMenu
                value={range}
                onChange={setRange}
                clock={entryClock}
                align="end"
                aria-label="Statement period"
              />
            ),
            actions,
            info: (
              <InfoTip label="About the account statement" placement="bottom">
                Money into the account is a debit, money out a credit, each dated by its entry date.
                The opening line is the balance before the period starts.
              </InfoTip>
            ),
          }}
        />
        <DataSection title="account statement" query={ledgerQ} enabled placeholderHeight={240}>
          <StatementView
            statement={statement}
            label={`${account.name} statement`}
            emptyMessage="No movements in this period."
          />
        </DataSection>
      </section>
    </div>
  );
};
