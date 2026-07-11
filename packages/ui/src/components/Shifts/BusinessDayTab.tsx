import React, { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarRange, Info } from 'lucide-react';
import { resolveBusinessDate } from '@pump/shared';
import { KpiStrip, KpiTile, Panel, StatusChip, Chip, DateText, EmptyState } from '../../pump-ds/index.js';
import { DataTable } from '../primitives/DataTable.js';
import { inr, formatQty, formatTime } from '../../utils/format.js';
import { useDailyDssrPreview, useShiftStatus } from '../../query/hooks.js';

interface BusinessDayTabProps {
  selectedStation: any | null;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 16px',
  borderBottom: '1px solid var(--border-soft)',
  fontSize: '13px',
};
const money: React.CSSProperties = { fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' };

/**
 * Business Day cockpit (read-only). The Shifts page is shift-centric; this tab
 * surfaces the *business-day* layer — the universal anchor — so day-level
 * activity is visible even when no shift is open. Composed live from the DSSR
 * preview (all closed shifts + day-level collections, credit, purchases,
 * supplier payments and expenses + P&L), without writing a snapshot.
 * Phase 1 = read-only; the Close-Day / DSSR action is a later phase.
 */
export const BusinessDayTab: React.FC<BusinessDayTabProps> = ({ selectedStation }) => {
  const stationId = selectedStation?.id ?? null;
  const settings = (selectedStation?.settings ?? {}) as { timezone?: string; business_day_starts_at?: string };
  const businessDate = useMemo(
    () => resolveBusinessDate({ timeZone: settings.timezone, dayStartsAt: settings.business_day_starts_at }),
    [settings.timezone, settings.business_day_starts_at],
  );

  const previewQ = useDailyDssrPreview(stationId, businessDate, { enabled: !!stationId } as any);
  const { data: shiftStatus } = useShiftStatus(stationId, true, { enabled: !!stationId } as any);
  const hasOpenShift = !!(shiftStatus as any)?.activeShift;

  const preview = previewQ.data as any;
  const snap = preview?.snapshotData ?? null;

  const shiftRows = (snap?.shifts ?? []) as any[];
  const shiftColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        id: 'template',
        header: 'Shift',
        cell: ({ row }) => (
          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{row.original.templateName || 'Custom'}</span>
        ),
      },
      {
        id: 'closedAt',
        header: 'Closed',
        cell: ({ row }) =>
          row.original.closedAt ? (
            <DateText value={row.original.closedAt} variant="time" />
          ) : (
            <Chip tone="success" size="xs">Open</Chip>
          ),
      },
      {
        id: 'netVolume',
        header: 'Net Volume',
        cell: ({ row }) => <span style={{ fontFamily: 'var(--font-mono)' }}>{formatQty(row.original.netVolume || 0, 2)} L</span>,
      },
      {
        id: 'expectedDrawerCash',
        header: 'Expected Drawer',
        cell: ({ row }) => <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(row.original.expectedDrawerCash || 0)}</span>,
      },
      {
        id: 'cashVariance',
        header: 'Cash Variance',
        cell: ({ row }) => {
          const v = Number(row.original.cashVariance || 0);
          const color = v < 0 ? 'var(--brand-danger)' : v > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
          return (
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
              {v > 0 ? '+' : ''}
              {inr(v)}
            </span>
          );
        },
      },
    ],
    [],
  );

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view the business day.
      </div>
    );
  }

  const status = (snap?.status as string) || 'OPEN';
  const liveAsOf = preview?.generatedAt ? formatTime(preview.generatedAt) : null;

  const fuel = snap?.fuel ?? {};
  const collections = snap?.collections ?? {};
  const credit = snap?.credit ?? {};
  const expenses = snap?.expenses ?? {};
  const purchases = snap?.purchases ?? {};
  const supplierPayments = snap?.supplierPayments ?? {};
  const pnl = snap?.pnl ?? {};
  const merchandise = snap?.merchandise ?? {};

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontFamily: 'var(--font-sans)' }}>
      {/* Day header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CalendarRange size={18} style={{ color: 'var(--text-muted)' }} />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)' }}>
              <DateText value={businessDate} tone="strong" icon={false} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Business day · the universal anchor for all records</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <StatusChip status={status === 'CLOSED' ? 'closed' : 'open'} size="sm" />
          {preview?.live && <Chip tone="warning" size="xs">Live{liveAsOf ? ` · ${liveAsOf}` : ''}</Chip>}
        </div>
      </div>

      {previewQ.isLoading ? (
        <Panel flush title="Business day">
          <div style={{ padding: '16px' }}>
            <EmptyState compact icon={<CalendarRange />} title="Loading…" description="Composing the business day." />
          </div>
        </Panel>
      ) : !snap ? (
        <Panel flush title="Business day">
          <div style={{ padding: '12px' }}>
            <EmptyState
              compact
              icon={<CalendarRange />}
              title="No activity yet"
              description="This business day opens automatically with the first shift or financial entry."
            />
          </div>
        </Panel>
      ) : (
        <>
          {/* Headline KPIs */}
          <KpiStrip columns="auto">
            <KpiTile dot="brand" label="Net Fuel Volume" value={`${formatQty(fuel.totalNetVolume || 0, 1)} L`} hint={`${snap.shiftsIncluded || 0} closed shift${snap.shiftsIncluded === 1 ? '' : 's'}`} />
            <KpiTile dot="info" label="Revenue" value={inr(pnl.revenue || 0)} hint={`Fuel ${inr(pnl.revenueFuel || 0)} · Merch ${inr(pnl.revenueMerch || 0)}`} />
            <KpiTile dot="success" valueTone="success" label="Collections" value={inr(collections.total || 0)} hint="Customer receipts" />
            <KpiTile dot="warning" valueTone="warning" label="Credit Issued" value={inr(credit.total || 0)} hint={`Fleet ${inr(credit.fleetCredit || 0)}`} />
            <KpiTile dot="danger" valueTone="danger" label="Purchases" value={inr(purchases.total || 0)} hint="Stock inflow (business-day anchored)" />
            <KpiTile dot={Number(pnl.netProfit || 0) < 0 ? 'danger' : 'success'} valueTone={Number(pnl.netProfit || 0) < 0 ? 'danger' : 'success'} label="Net Profit" value={inr(pnl.netProfit || 0)} hint={`Gross ${inr(pnl.grossMargin || 0)}`} />
          </KpiStrip>

          {/* Live caveat: open-shift fuel isn't counted until the shift closes. */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              Provisional day view composed from <strong>{snap.shiftsIncluded || 0} closed shift{snap.shiftsIncluded === 1 ? '' : 's'}</strong> plus live merchandise, collections, credit, purchases &amp; expenses.
              {hasOpenShift
                ? " Fuel from the currently open shift isn't counted until it closes (nozzle readings are taken at close)."
                : ' Fuel for a shift is counted once that shift closes.'}
            </span>
          </div>

          {/* Shifts in this day */}
          <Panel flush title="Shifts in this day">
            <DataTable
              columns={shiftColumns}
              data={shiftRows}
              bare
              getRowId={(s: any) => s.shiftId}
              emptyMessage="No shifts have been opened for this business day yet."
            />
          </Panel>

          {/* Day financials — grouped, drawer vs non-drawer made explicit */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
            <Panel flush title="Collections & credit">
              <div style={rowStyle}><span>Cash</span><span style={money}>{inr(collections.Cash || 0)}</span></div>
              <div style={rowStyle}><span>Card</span><span style={money}>{inr(collections.Card || 0)}</span></div>
              <div style={rowStyle}><span>UPI</span><span style={money}>{inr(collections.UPI || 0)}</span></div>
              <div style={rowStyle}><span>Bank transfer</span><span style={money}>{inr(collections.BankTransfer || 0)}</span></div>
              <div style={{ ...rowStyle }}><span style={{ fontWeight: 600 }}>Collections total</span><span style={{ ...money, fontWeight: 700 }}>{inr(collections.total || 0)}</span></div>
              <div style={rowStyle}><span>Credit — regular</span><span style={money}>{inr(credit.normalCredit || 0)}</span></div>
              <div style={{ ...rowStyle, borderBottom: 'none' }}><span>Credit — fleet</span><span style={money}>{inr(credit.fleetCredit || 0)}</span></div>
            </Panel>

            <Panel flush title="Outflows & merchandise">
              <div style={rowStyle}><span>Purchases</span><span style={money}>{inr(purchases.total || 0)}</span></div>
              <div style={rowStyle}><span>Supplier payments — drawer</span><span style={money}>{inr(supplierPayments.drawer || 0)}</span></div>
              <div style={rowStyle}><span>Supplier payments — bank/owner</span><span style={money}>{inr(supplierPayments.bank || 0)}</span></div>
              <div style={rowStyle}><span>Expenses — drawer (petty)</span><span style={money}>{inr(expenses.drawer || 0)}</span></div>
              <div style={rowStyle}><span>Expenses — bank/owner</span><span style={money}>{inr(expenses.business || 0)}</span></div>
              <div style={{ ...rowStyle, borderBottom: 'none' }}><span>Merchandise sales</span><span style={money}>{inr(merchandise.salesValue || 0)}</span></div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};
