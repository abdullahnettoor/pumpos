import React, { useEffect, useMemo, useRef } from 'react';
import { StatementTable } from '../pump-ds/statement-table/StatementTable.js';
import type { TableColumn } from '../pump-ds/table/columns.js';
import { cn } from '../pump-ds/lib/cn.js';
import { formatMoney } from '../utils/format.js';
import type { LedgerStatement } from './model.js';
import {
  CLOSING_LABEL,
  NO_ROWS_IN_PERIOD,
  STATEMENT_HEADERS,
  closingFigures,
  lineDate,
  statementLines,
  type StatementLine,
} from './lines.js';

export interface StatementViewProps {
  statement: LedgerStatement;
  /** Accessible name of the table ("Acme Transport statement"). */
  label: string;
  /** Shown when an all-time statement has no rows at all. */
  emptyMessage?: string;
  /**
   * Scroll the latest row and the closing line into view when the statement
   * shows or grows: an all-time statement is oldest first, so its news is at
   * the bottom. For the statement drawers.
   */
  scrollToEnd?: boolean;
  className?: string;
}

/** Shown above a statement whose entries don't add up to the server's balances. */
export const NOT_RECONCILED_NOTE =
  "These entries don't add up to the balance on record, so the balances shown are worked out from the entries.";

/**
 * Logs a statement that doesn't reconcile, once per statement shown: an
 * effect, not the build (StrictMode renders twice), and guarded by a ref so
 * StrictMode's re-run of the effect doesn't log it again.
 */
function useWarnOnce(statement: LedgerStatement, label: string): void {
  const warned = useRef<string | null>(null);
  const key = statement.reconciled
    ? null
    : [statement.kind, label, statement.opening, statement.closing, statement.rows.length].join(
        '|',
      );
  useEffect(() => {
    if (key === null || warned.current === key) return;
    warned.current = key;
    console.warn(
      `[statement] ${label}: the entries don't add up to the server's balances; showing balances worked out from the entries.`,
      { kind: statement.kind, opening: statement.opening, closing: statement.closing },
    );
  }, [key, label, statement]);
}

/** A blank cell for a side the line did not move, as the PDF prints it. */
const money = (v: number | null): string => (v ? formatMoney(v) : '');

const COLUMNS: TableColumn<StatementLine>[] = [
  {
    id: 'date',
    header: STATEMENT_HEADERS.date,
    kind: 'date',
    width: '16%',
    value: (l) => l.date || null,
    cell: (l) => <span className="whitespace-nowrap">{lineDate(l.date)}</span>,
  },
  {
    id: 'particulars',
    header: STATEMENT_HEADERS.particulars,
    kind: 'text',
    value: (l) => l.particulars,
    cell: (l) => (
      <>
        <span className={l.opening ? 'text-ink-muted' : 'text-ink-strong'}>{l.particulars}</span>
        {l.detail && <span className="block text-xs text-ink-muted">{l.detail}</span>}
      </>
    ),
  },
  {
    id: 'debit',
    header: STATEMENT_HEADERS.debit,
    kind: 'money',
    width: '15%',
    value: (l) => l.debit,
    cell: (l) => money(l.debit),
  },
  {
    id: 'credit',
    header: STATEMENT_HEADERS.credit,
    kind: 'money',
    width: '15%',
    value: (l) => l.credit,
    cell: (l) => money(l.credit),
  },
  {
    id: 'balance',
    header: STATEMENT_HEADERS.balance,
    kind: 'money',
    width: '16%',
    value: (l) => l.balance,
  },
];

/**
 * The screen view of a statement: Date · Particulars · Debit · Credit ·
 * Balance on the Table module's statement adapter, oldest first, an opening
 * line when the period carries one and a closing line under the totals. The
 * PDF (`statementDocProps`) prints the same lines.
 */
export const StatementView: React.FC<StatementViewProps> = ({
  statement,
  label,
  emptyMessage = 'No transactions yet.',
  scrollToEnd = false,
  className,
}) => {
  const lines = useMemo(() => statementLines(statement), [statement]);
  const end = useRef<HTMLDivElement>(null);
  const rowCount = statement.rows.length;
  useEffect(() => {
    if (scrollToEnd && rowCount > 0) end.current?.scrollIntoView?.({ block: 'end' });
  }, [scrollToEnd, rowCount]);
  useWarnOnce(statement, label);
  const noRows = rowCount === 0;
  if (noRows && statement.opening === null) {
    return <p className="px-2 py-1.5 text-xs text-ink-muted">{emptyMessage}</p>;
  }
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {!statement.reconciled && (
        <p role="note" className="rounded-input bg-warning-bg px-3 py-2 text-xs text-warning-fg">
          {NOT_RECONCILED_NOTE}
        </p>
      )}
      <StatementTable<StatementLine>
        label={label}
        columns={COLUMNS}
        rows={lines}
        rowKey={(l) => l.id}
        totalRow={{ label: CLOSING_LABEL, values: closingFigures(statement) }}
      />
      {noRows && <p className="px-2 text-xs text-ink-muted">{NO_ROWS_IN_PERIOD}</p>}
      <div ref={end} aria-hidden="true" />
    </div>
  );
};
