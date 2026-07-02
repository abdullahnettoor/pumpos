import React from 'react';
import { inr } from '../../utils/format.js';

export interface LedgerResolved {
  id: string;
  /** Sortable instant (ISO string / Date / epoch). */
  date: string | number | Date;
  /** Primary date/period label shown in the first column. */
  dateLabel: string;
  /** Optional secondary line under the date (e.g. shift name). */
  subLabel?: string;
  /** Transaction type label. */
  type: string;
  typeColor?: string;
  notes?: string;
  amount: number;
  /** debit raises the running balance, credit lowers it. */
  direction: 'debit' | 'credit';
}

export interface LedgerComputed {
  /** Resolved rows in chronological (oldest→newest) order, each with balance. */
  rows: (LedgerResolved & { runningBalance: number })[];
  totalDebit: number;
  totalCredit: number;
  /** Balance after the last row (period closing balance). */
  closingBalance: number;
}

/**
 * Resolve + sort entries oldest→newest and accumulate the running balance
 * (debit raises, credit lowers) plus column totals. Shared by `<LedgerView>`
 * and the PDF statement builder so both agree exactly.
 */
export function computeLedgerRows(
  entries: any[],
  resolve: (tx: any) => LedgerResolved,
  openingBalance = 0,
): LedgerComputed {
  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = (entries || [])
    .map(resolve)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((r) => {
      if (r.direction === 'debit') {
        running += r.amount;
        totalDebit += r.amount;
      } else {
        running -= r.amount;
        totalCredit += r.amount;
      }
      return { ...r, runningBalance: running };
    });
  return { rows, totalDebit, totalCredit, closingBalance: running };
}

export interface LedgerViewProps {
  entries: any[];
  resolve: (tx: any) => LedgerResolved;
  openingBalance?: number;
  /** @deprecated superseded by the two-column debit/credit layout. */
  amountLabel?: string;
  debitLabel?: string;
  creditLabel?: string;
  balanceLabel?: string;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
}


/**
 * Generic Tally-style running-balance ledger table. Reused for customer,
 * supplier, cash and bank statements (Phase L). Two-column debit/credit layout
 * with a totals footer — matches the accounting convention operators expect.
 * The running balance is computed on demand (debit raises, credit lowers) —
 * nothing is stored. Newest row first.
 */
export const LedgerView: React.FC<LedgerViewProps> = ({
  entries,
  resolve,
  openingBalance = 0,
  debitLabel = 'Debit',
  creditLabel = 'Credit',
  balanceLabel = 'Balance',
  loading,
  error,
  emptyText = 'No transaction history found.',
}) => {
  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading ledger…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: '12px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
        {error}
      </div>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <div style={{ padding: '24px', border: '1px dashed var(--border-soft)', borderRadius: 'var(--radius-card)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        {emptyText}
      </div>
    );
  }

  // Compute the running balance oldest→newest, then display newest first.
  const { rows: sorted, totalDebit, totalCredit, closingBalance } = computeLedgerRows(entries, resolve, openingBalance);
  const rows = [...sorted].reverse();

  return (
    <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Date / Period</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Type</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>{debitLabel}</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>{creditLabel}</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>{balanceLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isDebit = r.direction === 'debit';
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{r.dateLabel}</div>
                  {r.subLabel && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.subLabel}</div>}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ fontWeight: 600, color: r.typeColor || 'var(--text-default)' }}>{r.type}</span>
                  {r.notes && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.notes}</div>}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                  {isDebit ? inr(r.amount) : ''}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--state-success-fg)' }}>
                  {isDebit ? '' : inr(r.amount)}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                  {inr(r.runningBalance)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderTop: '1px solid var(--border-strong)' }}>
            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-strong)' }} colSpan={2}>Totals</td>
            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(totalDebit)}</td>
            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--state-success-fg)' }}>{inr(totalCredit)}</td>
            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(closingBalance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
