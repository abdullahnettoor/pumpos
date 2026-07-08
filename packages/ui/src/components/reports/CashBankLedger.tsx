import React, { useMemo, useState } from 'react';
import { useFinanceMovements } from '../../query/hooks.js';
import { KpiCard } from '../primitives/KpiCard.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { Segmented } from '../primitives/Segmented.js';
import { inr } from '../../utils/format.js';

export interface CashBankLedgerProps {
  selectedStation: any | null;
}

const GROUP: Record<string, 'Cash' | 'Bank'> = {
  CASH_IN_HAND: 'Cash',
  PETTY_CASH: 'Cash',
  BANK: 'Bank',
};

const SOURCE_LABEL: Record<string, string> = {
  OPENING: 'Opening balance',
  SALE_CASH: 'Cash sales',
  SALE_CARD: 'Card/UPI sales',
  COLLECTION: 'Collection',
  EXPENSE: 'Expense',
  SUPPLIER_PAYMENT: 'Supplier payment',
  DEPOSIT: 'Deposit',
  TRANSFER: 'Transfer',
  SETTLEMENT: 'Settlement',
  BANK_CHARGE: 'Bank charge',
  ADJUSTMENT: 'Adjustment',
};

/**
 * Cash & Bank ledger (Phase L3, repriced in FA6): a period statement of the
 * persisted money ledger, grouped Cash (cash-in-hand + petty cash) vs Bank. Now
 * reads the authoritative `ledger_entries` (shift sales, collections, expenses,
 * transfers, settlements, charges) — the live cash position, not a derived
 * subset. Per-account statements + true opening balances live on the Accounts page.
 */
export const CashBankLedger: React.FC<CashBankLedgerProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [account, setAccount] = useState<'Cash' | 'Bank'>('Cash');

  const { data, isLoading, error } = useFinanceMovements({ stationId: selectedStation?.id, from: range.from, to: range.to });
  const movements = data?.movements;

  // Opening balance carried from before the range: Σ(in − out) for the selected
  // group's account types, dated before range.from (computed server-side).
  const openingBalance = useMemo(() => {
    return (data?.openings || [])
      .filter((o: any) => GROUP[o.accountType] === account)
      .reduce((acc: number, o: any) => acc + Number(o.opening || 0), 0);
  }, [data, account]);

  // Map ledger movements → display rows, newest-first, filtered to the group.
  const rows = useMemo(
    () =>
      (movements || [])
        .filter((m: any) => GROUP[m.accountType] === account)
        .map((m: any) => ({
          id: m.id,
          date: m.entryDate,
          label: m.accountName,
          source: SOURCE_LABEL[m.sourceType] ?? m.sourceType,
          direction: m.direction,
          amount: Number(m.amount || 0),
        }))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movements, account],
  );

  const totals = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const m of rows) {
      if (m.direction === 'in') moneyIn += Number(m.amount || 0);
      else moneyOut += Number(m.amount || 0);
    }
    return { moneyIn, moneyOut, net: moneyIn - moneyOut, closing: openingBalance + moneyIn - moneyOut };
  }, [rows, openingBalance]);

  // Running balance computed oldest→newest starting from the carried opening,
  // displayed newest-first.
  const withBalance = useMemo(() => {
    const asc = [...rows].reverse();
    let bal = openingBalance;
    const map = new Map<string, number>();
    asc.forEach((m, i) => {
      bal += m.direction === 'in' ? Number(m.amount || 0) : -Number(m.amount || 0);
      map.set(`${m.id}-${i}`, bal);
    });
    let idx = asc.length;
    return rows.map((m: any) => {
      idx -= 1;
      return { ...m, runningBalance: map.get(`${m.id}-${idx}`) ?? 0 };
    });
  }, [rows, openingBalance]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <DateRangeField value={range} onChange={setRange} clock={clock} />
        <div style={{ minWidth: 200 }}>
          <Segmented
            options={[{ value: 'Cash', label: 'Cash' }, { value: 'Bank', label: 'Bank' }]}
            value={account}
            onChange={(v) => setAccount(v as 'Cash' | 'Bank')}
            aria-label="Account"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <KpiCard label="Opening Balance" value={inr(openingBalance)} tone={openingBalance < 0 ? 'danger' : 'default'} />
        <KpiCard label="Money In" value={inr(totals.moneyIn)} tone="success" />
        <KpiCard label="Money Out" value={inr(totals.moneyOut)} tone="danger" />
        <KpiCard label="Closing Balance" value={inr(totals.closing)} tone={totals.closing < 0 ? 'danger' : 'default'} />
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
        Live {account.toLowerCase()} movements from the money ledger (shift sales, collections, expenses, transfers &amp; settlements). Opening balance carries the closing position from before the selected range; closing = opening + in − out.
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
              {['Date', 'Description', 'Source', 'In', 'Out', 'Balance'].map((h, i) => (
                <th key={h} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--state-danger-fg)' }}>Failed to load movements.</td></tr>
            ) : withBalance.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No {account.toLowerCase()} movements in this range.</td></tr>
            ) : (
              <>
                {withBalance.map((m: any) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-default)' }}>{m.date ? new Date(m.date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-strong)' }}>{m.label}</td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{m.source}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--state-success-fg)' }}>{m.direction === 'in' ? inr(m.amount) : ''}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--state-danger-fg)' }}>{m.direction === 'out' ? inr(m.amount) : ''}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)' }}>{inr(m.runningBalance)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid var(--border-soft)', backgroundColor: 'var(--bg-surface-alt)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontStyle: 'italic' }}>—</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontStyle: 'italic' }} colSpan={4}>Opening balance (carried from before {range.from})</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)' }}>{inr(openingBalance)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
