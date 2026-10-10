import React, { useMemo, useState } from 'react';
import { inr } from '@pump/ui';
import {
  buildStatement,
  fullDayLabel,
  STATEMENT_PAGE,
  type LedgerRow,
  type PartyKind,
} from '../../lib/money/statement.js';
import { signedRupees } from '../../lib/money/format.js';
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { SeeAllButton } from '../../ui/SeeAllButton.js';
import { StatementList } from './StatementList.js';

/** A statement that covers only the months since `from`; what came before is carried in as a balance. */
export interface StatementWindow {
  /** First day of the window (`YYYY-MM-DD`). */
  from: string;
  /** Owed just before `from` (the ranged ledger's periodOpeningBalance). */
  openingBalance: number;
  /** Fetch an earlier window; absent when there is nothing earlier to show. */
  onEarlier?: () => void;
}

interface Props {
  kind: PartyKind;
  /** The server's balance for the party: the running balance is shown only if the rows close on it. */
  balance: number;
  rows: readonly LedgerRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Set for a windowed statement (the customer's ranged ledger); unset = the rows are the whole ledger. */
  period?: StatementWindow;
}

/** What a windowed statement says about everything before its first row. */
const CarriedForward: React.FC<{ period: StatementWindow }> = ({ period }) => {
  const settled = Math.abs(period.openingBalance) < 0.005;
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
            ? signedRupees(period.openingBalance)
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
}) => {
  const [visible, setVisible] = useState(STATEMENT_PAGE);
  const statement = useMemo(
    () => buildStatement(rows ?? [], visible, balance, kind, period?.openingBalance ?? 0),
    [rows, visible, balance, kind, period?.openingBalance],
  );

  return (
    <>
      <SectionLabel>Statement</SectionLabel>
      {isLoading ? (
        <Note>Loading statement…</Note>
      ) : isError ? (
        <Note>
          Couldn’t load the statement.{' '}
          <button type="button" onClick={onRetry} className="font-bold text-accent">
            Retry
          </button>
        </Note>
      ) : statement.total === 0 && !(period && Math.abs(period.openingBalance) >= 0.005) ? (
        <Note>
          {statement.reconciled
            ? period
              ? `No transactions since ${fullDayLabel(period.from)}.`
              : 'No transactions yet.'
            : 'No statement entries to show for this balance.'}
        </Note>
      ) : (
        <StatementList
          statement={statement}
          onLoadMore={() => setVisible((n) => n + STATEMENT_PAGE)}
          trailing={period && <CarriedForward period={period} />}
        />
      )}
      {period?.onEarlier && !isLoading && !isError && !statement.hasMore && (
        <SeeAllButton onClick={period.onEarlier}>Earlier months</SeeAllButton>
      )}
    </>
  );
};
