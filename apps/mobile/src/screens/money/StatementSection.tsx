import React, { useMemo, useState } from 'react';
import {
  buildStatement,
  STATEMENT_PAGE,
  type LedgerRow,
  type PartyKind,
} from '../../lib/money/statement.js';
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { StatementList } from './StatementList.js';

interface Props {
  kind: PartyKind;
  /** The server's balance for the party: the running balance is shown only if the rows close on it. */
  balance: number;
  rows: readonly LedgerRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

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
}) => {
  const [visible, setVisible] = useState(STATEMENT_PAGE);
  const statement = useMemo(
    () => buildStatement(rows ?? [], visible, balance, kind),
    [rows, visible, balance, kind],
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
    </>
  );
};
