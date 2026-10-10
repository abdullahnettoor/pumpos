import React from 'react';
import { StatementFilterSheet } from './StatementFilterSheet.js';
import { StatementSection } from './StatementSection.js';
import { rangeLabel } from '../../lib/money/statementRange.js';
import type { PartyStatementState } from './usePartyStatement.js';

/**
 * The Statement block of a Customer or Supplier page: the ranged ledger for the
 * range in `usePartyStatement`, its Filter sheet, and the balance brought forward.
 *
 * "Earlier months" is offered only while the page follows its default window (this
 * month, and the months that button itself adds). A range picked in the Filter,
 * whichever preset or dates, is shown exactly as picked, with no such button: the
 * Filter is how you move it. The running balances are the server's.
 */
export const PartyStatement: React.FC<{ statement: PartyStatementState }> = ({ statement }) => {
  const { range, ledger, kind } = statement;
  return (
    <>
      <StatementSection
        kind={kind}
        // The range's own closing balance: a past range does not end on today's balance.
        balance={ledger ? Number(ledger.closingBalance) : statement.balance}
        onFilter={() => statement.setFiltering(true)}
        rows={ledger?.entries}
        isLoading={statement.isLoading}
        isError={statement.isError}
        onRetry={() => void statement.refetch()}
        period={
          ledger
            ? {
                from: range.range.from,
                label: rangeLabel(range.range),
                openingBalance: Number(ledger.periodOpeningBalance) || 0,
                // Anything dated before the range can be loaded, even when it nets to 0: a party
                // settled before the range still has history to read.
                onEarlier:
                  ledger.hasEarlier && range.choice.kind === 'recent' ? range.widen : undefined,
                isLoadingEarlier: statement.isFetchingMore,
              }
            : undefined
        }
      />
      <StatementFilterSheet
        open={statement.filtering}
        onClose={() => statement.setFiltering(false)}
        today={range.today}
        choice={range.choice}
        onApply={range.choose}
      />
    </>
  );
};
