import React, { useMemo, useState } from 'react';
import { useDailyDssrRange, useDailyDssrPreview, useShiftStatus } from '../../query/hooks.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { resolveBusinessDate } from '@pump/shared';
import { KpiStrip, KpiTile, Panel, Chip, DateText, EmptyState } from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';

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
  // Shift status → whether an open shift's fuel is still pending (Option 1 context).
  const { data: shiftStatus } = useShiftStatus(selectedStation?.id, true, { enabled: !!selectedStation?.id && todayInRange } as any);
  const hasOpenShift = !!(shiftStatus as any)?.activeShift;
  const closedShiftsToday = Number((preview as any)?.snapshotData?.shiftsIncluded || 0);
  const liveAsOf = (preview as any)?.generatedAt ? new Date((preview as any).generatedAt).toLocaleTimeString('en-IN') : null;

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
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        note={`${isSingleDay ? 'Single day' : 'Period total'} · COGS uses each day's weighted-average cost (frozen at close; live today).`}
      />

      {/* Headline KPIs (period total, or the single day) */}
      <KpiStrip columns="auto">
        <KpiTile dot="brand" label="Revenue" value={inr(totals.revenue)} />
        <KpiTile dot="warning" valueTone="warning" label="COGS" value={inr(totals.cogs)} />
        <KpiTile dot="success" valueTone="success" label="Gross Margin" value={inr(totals.grossMargin)} hint={`${marginPct.toFixed(1)}% of revenue`} />
        <KpiTile dot="danger" valueTone="danger" label="Operating Expenses" value={inr(totals.expenses)} />
        <KpiTile dot={totals.netProfit < 0 ? 'danger' : 'success'} valueTone={totals.netProfit < 0 ? 'danger' : 'success'} label="Net Profit" value={inr(totals.netProfit)} />
      </KpiStrip>

      {/* Live "as-of" context (Option 1): explain what the open day includes so
          fuel reading 0/partial before shift close is never mistaken for a bug. */}
      {todayInRange && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
          <span style={{ fontWeight: 700 }}>Live</span>
          <span>
            Today ({todayBiz}) is provisional{liveAsOf ? `, as of ${liveAsOf}` : ''}. It includes{' '}
            <strong>{closedShiftsToday} closed shift{closedShiftsToday === 1 ? '' : 's'}</strong> plus live merchandise, collections &amp; expenses.
            {hasOpenShift
              ? " Fuel from the currently open shift isn't counted until it closes (nozzle readings are taken at close)."
              : ' Fuel for a shift is counted once that shift closes.'}
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : days.length === 0 ? (
        <Panel flush>
          <EmptyState
            title="No profit data for this period"
            description="Generate the DSSR for closed days to include them. The open day appears here live once it has sales."
          />
        </Panel>
      ) : isSingleDay && single ? (
        // --- Single-day P&L statement ---
        <Panel
          flush
          title={<>Profit &amp; Loss — <DateText value={single.date} /></>}
          action={<Chip tone={single.live ? 'warning' : 'success'} variant="soft">{single.live ? 'LIVE · not finalized' : 'FINAL'}</Chip>}
        >
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
        </Panel>
      ) : (
        // --- Period breakdown: per-day table ---
        <Panel flush title="Daily breakdown">
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
                    <DateText value={d.date} /> {d.live && <Chip tone="warning" variant="soft" size="sm">LIVE</Chip>}
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
        </Panel>
      )}

      <div style={{ fontSize: '10px', color: 'var(--text-faint)' }}>
        Period profit is the sum of each day&apos;s profit, each computed with that day&apos;s own cost basis (so historical cost changes are respected). Days without a generated DSSR are excluded from the total.
      </div>
    </div>
  );
};
