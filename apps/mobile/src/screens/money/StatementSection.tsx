import React, { useMemo, useState } from 'react';
import { inr } from '@pump/ui';
import { isBalancedVariance } from '@pump/shared';
import {
  buildStatement,
  fullDayLabel,
  STATEMENT_PAGE,
  type LedgerRow,
  type PartyKind,
} from '../../lib/money/statement.js';
import { signedMoney } from '../../lib/format.js';
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { SeeAllButton } from '../../ui/SeeAllButton.js';
import { StatementList } from './StatementList.js';

/** A statement that covers one date range; what came before is carried in as a balance. */
export interface StatementWindow {
  /** First day of the range (`YYYY-MM-DD`). */
  from: string;
  /** "October 2026": the range in words. */
  label: string;
  /** Owed just before `from` (the ranged ledger's periodOpeningBalance). */
  openingBalance: number;
  /** Add an earlier month; absent when there is no entry before `from`, or the range was picked by hand. */
  onEarlier?: () => void;
  /** An earlier window is being fetched: the rows stay, the button says so. */
  isLoadingEarlier?: boolean;
}

interface Props {
  kind: PartyKind;
  /** The server's balance for the party: the running balance is shown only if the rows close on it. */
  balance: number;
  rows: readonly LedgerRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Set for a ranged statement (the ranged ledger); unset = the rows are the whole ledger. */
  period?: StatementWindow;
  /** Opens the range Filter; absent = no Filter button. */
  onFilter?: () => void;
}

/** What a windowed statement says about everything before its first row. */
const CarriedForward: React.FC<{ period: StatementWindow }> = ({ period }) => {
  const settled = isBalancedVariance(period.openingBalance);
  return (
    <div className="flex items-center gap-2.5 border-t border-line bg-card-alt px-3 py-2.5 text-[11.5px] text-text-muted">
      <p className="min-w-0 flex-1">
        {settled
          ? `Nothing owed before ${fullDayLabel(period.from)}.`
          : `Balance brought forward from before ${fullDayLabel(period.from)}`}
      </p>
      {!settled && (
        <p className="num flex-shrink-0 text-[13px] font-semibold text-text-high">
          {period.openingBalance < 0
            ? signedMoney(period.openingBalance)
            : inr(period.openingBalance)}
        </p>
      )}
    </div>
  );
};

/**
 * The Statement block of a party page (Customer or Supplier): label, then the
 * loading / error / empty / list states. Paging is local ("Load more" shows 20
 * more of the rows already fetched).
 */
export const StatementSection: React.FC<Props> = ({
  kind,
  balance,
  rows,
  isLoading,
  isError,
  onRetry,
  period,
  onFilter,
}) => {
  const [visible, setVisible] = useState(STATEMENT_PAGE);
  const statement = useMemo(
    () => buildStatement(rows ?? [], visible, balance, kind, period?.openingBalance ?? 0),
    [rows, visible, balance, kind, period?.openingBalance],
  );

  return (
    <>
      <SectionLabel
        right={
          onFilter && (
            <button
              type="button"
              onClick={onFilter}
              // A 44px touch target around the small label, without growing the row.
              className="-mx-2 -my-3.5 inline-flex min-h-11 min-w-11 items-center justify-center px-2"
              aria-label={period ? `Filter statement, showing ${period.label}` : 'Filter statement'}
            >
              Filter ▾
            </button>
          )
        }
      >
        Statement
      </SectionLabel>
      {period && <p className="-mt-1 px-4 pb-2 text-[11.5px] text-text-muted">{period.label}</p>}
      {isLoading ? (
        <Note>Loading statement…</Note>
      ) : isError ? (
        <Note>
          Couldn’t load the statement.{' '}
          <button type="button" onClick={onRetry} className="font-bold text-accent">
            Retry
          </button>
        </Note>
      ) : statement.total === 0 && !(period && !isBalancedVariance(period.openingBalance)) ? (
        <Note>
          {statement.reconciled
            ? period
              ? `No transactions in ${period.label}.`
              : 'No transactions yet.'
            : 'No statement entries to show for this balance.'}
        </Note>
      ) : (
        <StatementList
          statement={statement}
          onLoadMore={() => setVisible((n) => n + STATEMENT_PAGE)}
          // While a wider window loads, the rows (and their opening balance) are the previous
          // window's: the footer would name the new `from`, so it waits for the data.
          trailing={period && !period.isLoadingEarlier && <CarriedForward period={period} />}
        />
      )}
      {period?.onEarlier && !isLoading && !isError && !statement.hasMore && (
        <SeeAllButton onClick={period.onEarlier} disabled={period.isLoadingEarlier}>
          {period.isLoadingEarlier ? 'Loading earlier months…' : 'Earlier months'}
        </SeeAllButton>
      )}
    </>
  );
};
