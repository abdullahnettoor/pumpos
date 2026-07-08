import React, { useMemo, useState } from 'react';
import { useDailyDssrRange, useDailyDssrPreview } from '../../query/hooks.js';
import { KpiCard } from '../primitives/KpiCard.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { resolveBusinessDate } from '@pump/shared';

export interface ProfitLossViewProps {
  selectedStation: any | null;
}

const num = (v: any) => Number(v || 0);

interface DayPnl {
  date: string;
  live: boolean;
  revenueFuel: number;
  revenueMerch: number;
  revenue: number;
  cogsFuel: number;
  cogsMerch: number;
  cogs: number;
  grossMargin: number;
  expenses: number;
  netProfit: number;
  hasData: boolean;
}

function pnlFromSnapshot(date: string, snapshotData: any, live: boolean): DayPnl {
  const p = snapshotData?.pnl || {};
  return {
    date,
    live,
    revenueFuel: num(p.revenueFuel),
    revenueMerch: num(p.revenueMerch),
    revenue: num(p.revenue),
    cogsFuel: num(p.cogsFuel),
    cogsMerch: num(p.cogsMerch),
    cogs: num(p.cogs),
    grossMargin: num(p.grossMargin),
    expenses: num(p.expenses),
    netProfit: num(p.netProfit),
    hasData: !!snapshotData,
  };
}

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const todayBiz = resolveBusinessDate({ timeZone: clock.timeZone, dayStartsAt: clock.dayStartsAt });
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  const isSingleDay = range.from === range.to;
  const todayInRange = todayBiz >= range.from && todayBiz <= range.to;

  const { data: snapshots, isLoading: loadingRange } = useDailyDssrRange(selectedStation?.id, range.from, range.to);
  // Live preview only when the range includes today's (open) business day.
  const { data: preview, isLoading: loadingPreview } = useDailyDssrPreview(
    selectedStation?.id,
    todayBiz,
    { enabled: !!selectedStation?.id && todayInRange } as any,
  );

  const loading = loadingRange || (todayInRange && loadingPreview);

  const days = useMemo(() => {
    const byDate = new Map<string, DayPnl>();
    for (const snap of (snapshots || []) as any[]) {
      byDate.set(snap.businessDate, pnlFromSnapshot(snap.businessDate, snap.snapshotData, false));
    }
    // Today: prefer the live preview (reflects current sales) over a stale snapshot.
    if (todayInRange && preview?.snapshotData) {
      byDate.set(todayBiz, pnlFromSnapshot(todayBiz, preview.snapshotData, true));
    }
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [snapshots, preview, todayInRange, todayBiz]);

  const totals = useMemo(() => {
    const acc = { revenueFuel: 0, revenueMerch: 0, revenue: 0, cogsFuel: 0, cogsMerch: 0, cogs: 0, grossMargin: 0, expenses: 0, netProfit: 0 };
    for (const d of days) {
      acc.revenueFuel += d.revenueFuel; acc.revenueMerch += d.revenueMerch; acc.revenue += d.revenue;
      acc.cogsFuel += d.cogsFuel; acc.cogsMerch += d.cogsMerch; acc.cogs += d.cogs;
      acc.grossMargin += d.grossMargin; acc.expenses += d.expenses; acc.netProfit += d.netProfit;
    }
    return acc;
  }, [days]);

  const marginPct = totals.revenue > 0 ? (totals.grossMargin / totals.revenue) * 100 : 0;
  const single = isSingleDay ? days[0] : null;

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border-soft)' };
  const cell: React.CSSProperties = { padding: '8px 12px', fontSize: '13px', textAlign: 'right', fontFamily: 'var(--font-mono)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <DateRangeField value={range} onChange={setRange} clock={clock} />
        <div style={{ fontSize: '11px', color: 'var(--text-faint)', alignSelf: 'center' }}>
          {isSingleDay ? 'Single day' : 'Period total'} · COGS uses each day&apos;s weighted-average cost (frozen at close; live today).
        </div>
      </div>

      {/* Headline KPIs (period total, or the single day) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <KpiCard label="Revenue" value={inr(totals.revenue)} tone="default" />
        <KpiCard label="COGS" value={inr(totals.cogs)} tone="danger" />
        <KpiCard label="Gross Margin" value={inr(totals.grossMargin)} tone="success" sub={`${marginPct.toFixed(1)}% of revenue`} />
        <KpiCard label="Operating Expenses" value={inr(totals.expenses)} tone="danger" />
        <KpiCard label="Net Profit" value={inr(totals.netProfit)} tone={totals.netProfit < 0 ? 'danger' : 'success'} />
      </div>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : days.length === 0 ? (
        <div style={{ padding: '24px', border: '1px dashed var(--border-soft)', borderRadius: 'var(--radius-card)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No profit data for this period. Generate the DSSR for closed days to include them.
        </div>
      ) : isSingleDay && single ? (
        // --- Single-day P&L statement ---
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg-surface-alt)', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Profit &amp; Loss — {single.date}</span>
            <span style={{ color: single.live ? 'var(--brand-warning)' : 'var(--state-success-fg)' }}>{single.live ? 'LIVE (not finalized)' : 'FINAL'}</span>
          </div>
          {([
            { label: 'Revenue — Fuel', value: inr(single.revenueFuel) },
            { label: 'Revenue — Merchandise', value: inr(single.revenueMerch) },
            { label: 'Total Revenue', value: inr(single.revenue), strong: true },
            { label: 'COGS — Fuel', value: `(${inr(single.cogsFuel)})`, color: 'var(--brand-warning)' },
            { label: 'COGS — Merchandise', value: `(${inr(single.cogsMerch)})`, color: 'var(--brand-warning)' },
            { label: 'Gross Margin', value: inr(single.grossMargin), strong: true },
            { label: 'Operating Expenses', value: `(${inr(single.expenses)})`, color: 'var(--brand-warning)' },
          ] as Array<{ label: string; value: string; color?: string; strong?: boolean }>).map((r, i) => (
            <div key={i} style={{ ...rowStyle, backgroundColor: r.strong ? 'var(--bg-surface-alt)' : 'transparent' }}>
              <span style={{ fontWeight: r.strong ? 700 : 400 }}>{r.label}</span>
              <span style={{ fontWeight: r.strong ? 700 : 600, fontFamily: 'var(--font-mono)', color: r.color || 'var(--text-default)' }}>{r.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', backgroundColor: 'var(--bg-surface-alt)' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Net Profit</span>
            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '15px', color: single.netProfit < 0 ? 'var(--state-danger-fg)' : 'var(--state-success-fg)' }}>{inr(single.netProfit)}</span>
          </div>
        </div>
      ) : (
        // --- Period breakdown: per-day table ---
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
                {['Date', 'Revenue', 'COGS', 'Gross Margin', 'Expenses', 'Net Profit'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-strong)' }}>
                    {d.date} {d.live && <span style={{ fontSize: '10px', color: 'var(--brand-warning)', fontWeight: 600 }}>· LIVE</span>}
                  </td>
                  <td style={cell}>{inr(d.revenue)}</td>
                  <td style={{ ...cell, color: 'var(--brand-warning)' }}>{inr(d.cogs)}</td>
                  <td style={cell}>{inr(d.grossMargin)}</td>
                  <td style={{ ...cell, color: 'var(--brand-warning)' }}>{inr(d.expenses)}</td>
                  <td style={{ ...cell, fontWeight: 700, color: d.netProfit < 0 ? 'var(--state-danger-fg)' : 'var(--state-success-fg)' }}>{inr(d.netProfit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderTop: '1px solid var(--border-strong)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700 }}>Total ({days.length} day{days.length === 1 ? '' : 's'})</td>
                <td style={{ ...cell, fontWeight: 700 }}>{inr(totals.revenue)}</td>
                <td style={{ ...cell, fontWeight: 700, color: 'var(--brand-warning)' }}>{inr(totals.cogs)}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{inr(totals.grossMargin)}</td>
                <td style={{ ...cell, fontWeight: 700, color: 'var(--brand-warning)' }}>{inr(totals.expenses)}</td>
                <td style={{ ...cell, fontWeight: 700, color: totals.netProfit < 0 ? 'var(--state-danger-fg)' : 'var(--state-success-fg)' }}>{inr(totals.netProfit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ fontSize: '10px', color: 'var(--text-faint)' }}>
        Period profit is the sum of each day&apos;s profit, each computed with that day&apos;s own cost basis (so historical cost changes are respected). Days without a generated DSSR are excluded from the total.
      </div>
    </div>
  );
};
