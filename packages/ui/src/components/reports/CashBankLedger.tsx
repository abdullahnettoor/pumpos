import React, { useMemo, useState } from 'react';
import { resolveBusinessDate } from '@pump/shared';
import { useMoneyMovements } from '../../query/hooks.js';
import { KpiCard } from '../primitives/KpiCard.js';
import { DateField } from '../primitives/Field.js';
import { Segmented } from '../primitives/Segmented.js';
import { inr } from '../../utils/format.js';

export interface CashBankLedgerProps {
  selectedStation: any | null;
}

/**
 * Cash & Bank ledger (Phase L3): a "payments & receipts" statement of the
 * discretely recorded money movements (collections in, expenses out, supplier
 * payments out), classified by Cash vs Bank account. Excludes fuel/drawer sales
 * (reconciled in the DSSR) and owner-funded items, so it never double-counts the
 * authoritative shift/DSSR figures. Balance is period-relative (opening balances
 * are a future enhancement).
 */
export const CashBankLedger: React.FC<CashBankLedgerProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const today = resolveBusinessDate({ timeZone: s.timezone, dayStartsAt: s.business_day_starts_at });
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [account, setAccount] = useState<'Cash' | 'Bank'>('Cash');

  const { data: movements, isLoading, error } = useMoneyMovements({ stationId: selectedStation?.id, from, to });

  const rows = useMemo(
    () => (movements || []).filter((m: any) => m.account === account),
    [movements, account],
  );

  const totals = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const m of rows) {
      if (m.direction === 'in') moneyIn += Number(m.amount || 0);
      else moneyOut += Number(m.amount || 0);
    }
    return { moneyIn, moneyOut, net: moneyIn - moneyOut };
  }, [rows]);

  // Running balance computed oldest→newest, displayed newest-first.
  const withBalance = useMemo(() => {
    const asc = [...rows].reverse();
    let bal = 0;
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
  }, [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="field-label">From</label>
            <DateField value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label">To</label>
            <DateField value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
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
        <KpiCard label="Money In" value={inr(totals.moneyIn)} tone="success" />
        <KpiCard label="Money Out" value={inr(totals.moneyOut)} tone="danger" />
        <KpiCard label="Net Movement" value={inr(totals.net)} tone={totals.net < 0 ? 'danger' : 'default'} />
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
        Recorded {account.toLowerCase()} receipts &amp; payments only — fuel/drawer reconciliation lives in the DSSR.
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
              withBalance.map((m: any) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-default)' }}>{m.date ? new Date(m.date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-strong)' }}>{m.label}</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{m.source}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--state-success-fg)' }}>{m.direction === 'in' ? inr(m.amount) : ''}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--state-danger-fg)' }}>{m.direction === 'out' ? inr(m.amount) : ''}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)' }}>{inr(m.runningBalance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
