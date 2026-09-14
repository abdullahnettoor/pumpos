import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Check, Info, Lock } from 'lucide-react';
import { KpiStrip, KpiTile, Panel, StatusChip, Chip, DateText, EmptyState, Button } from '../../pump-ds/index.js';
import { DataTable } from '../primitives/DataTable.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { CloudShiftService } from '../../services/cloud.js';
import { inr, formatDate, formatQty } from '../../utils/format.js';
import { useBusinessDayStatus, useDailyDssr, useDailyDssrPreview, useShiftStatus, useInvalidateOperational, useCustomers, queryKeys } from '../../query/hooks.js';
import { useStationBusinessDate } from '../../hooks/useStationBusinessDate.js';

const shiftService = new CloudShiftService();

interface BusinessDayTabProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  activeBusinessDayId?: string | null;
  requestedBusinessDate?: string | null;
  onBusinessDateSelected?: () => void;
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
 * Business Day cockpit. The Shifts page is shift-centric; this tab
 * surfaces the *business-day* layer — the universal anchor — so day-level
 * activity is visible even when no shift is open. Composed live from the DSSR
 * preview (all closed shifts + day-level collections, credit, purchases,
 * supplier payments and expenses + P&L), without writing a snapshot.
 * Owner/Manager closure generates the immutable DSSR snapshot and locks the
 * selected day. A day can close when it has no open Shift.
 */
function formatStationActivity(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

export const BusinessDayTab: React.FC<BusinessDayTabProps> = ({
  selectedStation,
  userRole,
  activeBusinessDayId,
  requestedBusinessDate,
  onBusinessDateSelected,
}) => {
  const stationId = selectedStation?.id ?? null;
  const settings = (selectedStation?.settings ?? {}) as { timezone?: string; business_day_starts_at?: string };
  const currentBusinessDate = useStationBusinessDate(settings.timezone, settings.business_day_starts_at);
  const [businessDate, setBusinessDate] = useState(currentBusinessDate);
  const initializedStationId = useRef<string | null>(null);

  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const invalidateOperational = useInvalidateOperational();
  const [closing, setClosing] = useState(false);
  const canClose = userRole === 'Owner' || userRole === 'Manager';

  const currentBusinessDayStatusQ = useBusinessDayStatus(stationId, currentBusinessDate, { enabled: !!stationId } as any);
  const businessDayStatusQ = useBusinessDayStatus(stationId, businessDate, { enabled: !!stationId } as any);
  const selectedState = businessDayStatusQ.data?.requestedState;
  const previewQ = useDailyDssrPreview(stationId, businessDate, { enabled: !!stationId && (selectedState === 'OPEN' || selectedState === 'NOT_CREATED') } as any);
  const snapshotQ = useDailyDssr(stationId, businessDate, { enabled: !!stationId && selectedState === 'CLOSED' } as any);
  const shiftStatusQ = useShiftStatus(stationId, true, { enabled: !!stationId } as any);
  const shiftStatus = shiftStatusQ.data;
  const activeShift = (shiftStatus as any)?.activeShift;

  // EOD-cycle customers still carrying a receivable that's expected cleared by
  // day close — surfaced as a (non-blocking) reminder before closing the day.
  const { data: dayCustomers } = useCustomers(true, { enabled: !!stationId && canClose && businessDate === currentBusinessDate } as any);
  const eodDueCustomers = useMemo(
    () => businessDate === currentBusinessDate
      ? (dayCustomers || []).filter((c: any) => c.settlementCycle === 'EOD' && Number(c.currentBalance || 0) > 0)
      : [],
    [businessDate, currentBusinessDate, dayCustomers],
  );
  const eodDueTotal = eodDueCustomers.reduce((s: number, c: any) => s + Number(c.currentBalance || 0), 0);

  const report = selectedState === 'CLOSED' ? snapshotQ.data : previewQ.data;
  const snap = (report as any)?.snapshotData ?? null;

  const openBusinessDays = useMemo(() => {
    return [...(currentBusinessDayStatusQ.data?.openBusinessDays ?? [])]
      .sort((a: any, b: any) => b.businessDate.localeCompare(a.businessDate));
  }, [currentBusinessDayStatusQ.data]);

  useEffect(() => {
    if (!stationId || initializedStationId.current === stationId || currentBusinessDayStatusQ.isFetching || shiftStatusQ.isFetching) return;
    const resolvedActiveBusinessDayId = activeShift?.businessDayId ?? activeBusinessDayId;
    const activeDay = openBusinessDays.find((day: any) => day.id === resolvedActiveBusinessDayId);
    setBusinessDate(requestedBusinessDate || activeDay?.businessDate || currentBusinessDate);
    initializedStationId.current = stationId;
    if (requestedBusinessDate) onBusinessDateSelected?.();
  }, [stationId, activeBusinessDayId, activeShift?.businessDayId, requestedBusinessDate, currentBusinessDate, openBusinessDays, currentBusinessDayStatusQ.isFetching, shiftStatusQ.isFetching, onBusinessDateSelected]);

  useEffect(() => {
    if (!requestedBusinessDate) return;
    if (requestedBusinessDate !== businessDate) setBusinessDate(requestedBusinessDate);
    initializedStationId.current = stationId;
    onBusinessDateSelected?.();
  }, [requestedBusinessDate, businessDate, stationId, onBusinessDateSelected]);
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
            <span>{formatStationActivity(row.original.closedAt, settings.timezone)}</span>
          ) : (
            <Chip tone="success" size="xs">Open</Chip>
          ),
      },
      {
        id: 'netVolume',
        header: 'Net Volume',
        cell: ({ row }) => row.original.closedAt
          ? <span style={{ fontFamily: 'var(--font-mono)' }}>{formatQty(row.original.netVolume || 0, 2)} L</span>
          : <span style={{ color: 'var(--text-faint)' }}>—</span>,
      },
      {
        id: 'expectedDrawerCash',
        header: 'Expected Drawer',
        cell: ({ row }) => row.original.closedAt
          ? <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(row.original.expectedDrawerCash || 0)}</span>
          : <span style={{ color: 'var(--text-faint)' }}>—</span>,
      },
      {
        id: 'cashVariance',
        header: 'Cash Variance',
        cell: ({ row }) => {
          if (!row.original.closedAt) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
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
    [settings.timezone],
  );

  const status = selectedState;
  const selectedBusinessDay = businessDayStatusQ.data?.requestedBusinessDay;
  const hasOpenShift = !!activeShift && activeShift.businessDayId === selectedBusinessDay?.id;
  const liveAsOf = status !== 'CLOSED' && (report as any)?.generatedAt ? formatStationActivity((report as any).generatedAt, settings.timezone) : null;
  const reportLoading = businessDayStatusQ.isPending || (status === 'CLOSED' ? snapshotQ.isLoading : previewQ.isLoading);
  const reportError = businessDayStatusQ.isError || (status === 'CLOSED' ? snapshotQ.isError : previewQ.isError);
  const shiftRows = (() => {
    const rows = [...((snap?.shifts ?? []) as any[])];
    if (hasOpenShift && !rows.some((row) => row.shiftId === activeShift.id)) {
      rows.unshift({
        shiftId: activeShift.id,
        templateName: activeShift.templateName,
        closedAt: null,
      });
    }
    return rows;
  })();

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view the business day.
      </div>
    );
  }

  const handleCloseDay = async () => {
    if (!snap?.businessDayId || !stationId) return;
    const eodNote = eodDueCustomers.length > 0
      ? `\n\n${eodDueCustomers.length} end-of-day customer${eodDueCustomers.length === 1 ? '' : 's'} still owe ${inr(eodDueTotal)} that was expected to be collected today.`
      : '';
    const ok = await confirm({
      title: 'Close this business day?',
      message: `This generates the immutable DSSR snapshot for ${businessDate} and seals sales and stock. Late financial entries remain available and are flagged separately.${eodNote}`,
      confirmLabel: 'Close day',
    });
    if (!ok) return;
    try {
      setClosing(true);
      await shiftService.closeBusinessDay(snap.businessDayId, stationId);
      toast.success('Business day closed · DSSR generated.');
      invalidateOperational(stationId);
      qc.invalidateQueries({ queryKey: queryKeys.dssr(stationId, businessDate) });
      qc.invalidateQueries({ queryKey: ['dssr-range'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to close the business day.');
    } finally {
      setClosing(false);
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {businessDayStatusQ.isError
            ? <Chip tone="danger" size="xs">Unavailable</Chip>
            : !status
            ? <Chip tone="neutral" size="xs">Checking</Chip>
            : status === 'NOT_CREATED'
            ? <Chip tone="neutral" size="xs">Not started</Chip>
            : <StatusChip status={status === 'CLOSED' ? 'closed' : 'open'} size="sm" />}
          {(report as any)?.live && <Chip tone="warning" size="xs">Live{liveAsOf ? ` · ${liveAsOf}` : ''}</Chip>}
          {status === 'OPEN' && canClose && snap && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Lock size={13} />}
              loading={closing}
              disabled={hasOpenShift}
              title={hasOpenShift ? 'Close the active shift before closing the business day' : 'Generate the DSSR snapshot and lock this day'}
              onClick={handleCloseDay}
            >
              Close business day
            </Button>
          )}
        </div>
      </div>

      <Panel flush title={`Open Business Days · ${openBusinessDays.length}`}>
        {currentBusinessDayStatusQ.isPending ? (
          <div style={{ padding: '12px' }}>
            <EmptyState compact icon={<CalendarRange />} title="Loading open Business Days" description="Checking the Station's Business Day lifecycle." />
          </div>
        ) : currentBusinessDayStatusQ.isError ? (
          <div style={{ padding: '12px' }}>
            <EmptyState compact icon={<CalendarRange />} title="Business Day status unavailable" description="Open days could not be loaded. Check the connection and retry." />
          </div>
        ) : openBusinessDays.length === 0 ? (
          <div style={{ padding: '12px' }}>
            <EmptyState compact icon={<CalendarRange />} title="No open Business Days" description="There are no open days requiring attention." />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {openBusinessDays.map((day: any) => {
              const selected = day.businessDate === businessDate;
              return (
              <button
                key={day.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setBusinessDate(day.businessDate)}
                style={{
                  ...rowStyle,
                  width: '100%',
                  gap: '16px',
                  border: 0,
                  borderBottom: '1px solid var(--border-soft)',
                  background: selected ? 'var(--state-info-bg)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ minWidth: 120 }}>
                  <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{formatDate(day.businessDate)} · Open</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  {Number(day.closedShiftCount)} closed · {Number(day.openShiftCount)} open
                </div>
                <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'right' }}>
                  Last activity {formatStationActivity(day.lastActivityAt, settings.timezone)}
                </div>
                {selected && <Check size={14} style={{ color: 'var(--state-info-fg)', flexShrink: 0 }} aria-label="Selected" />}
              </button>
            );})}
          </div>
        )}
      </Panel>

      {hasOpenShift && status === 'OPEN' && canClose && snap && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>A shift is still open. Close the active shift before closing the business day.</span>
        </div>
      )}

      {status === 'OPEN' && canClose && eodDueCustomers.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 12px', backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            {eodDueCustomers.length} end-of-day customer{eodDueCustomers.length === 1 ? '' : 's'} still owe{eodDueCustomers.length === 1 ? 's' : ''}{' '}
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{inr(eodDueTotal)}</strong> expected to be collected before day close
            {' — '}{eodDueCustomers.slice(0, 3).map((c: any) => c.name).join(', ')}{eodDueCustomers.length > 3 ? ` +${eodDueCustomers.length - 3} more` : ''}. You can still close the day.
          </span>
        </div>
      )}

      {reportLoading ? (
        <Panel flush title="Business day">
          <div style={{ padding: '16px' }}>
            <EmptyState compact icon={<CalendarRange />} title="Loading…" description="Composing the business day." />
          </div>
        </Panel>
      ) : reportError ? (
        <Panel flush title="Business day">
          <div style={{ padding: '12px' }}>
            <EmptyState
              compact
              icon={<CalendarRange />}
              title="Business Day workspace unavailable"
              description="This day's Shifts and operational context could not be loaded. Check the connection and retry."
            />
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

          {status !== 'CLOSED' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                Provisional day view composed from <strong>{snap.shiftsIncluded || 0} closed shift{snap.shiftsIncluded === 1 ? '' : 's'}</strong> plus live merchandise, collections, credit, purchases &amp; expenses.
                {hasOpenShift
                  ? " Fuel from the currently open shift isn't counted until it closes (nozzle readings are taken at close)."
                  : ' Fuel for a shift is counted once that shift closes.'}
              </span>
            </div>
          )}

          {status === 'CLOSED' && Number((report as any)?.lateEntryCount ?? 0) > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              <span>{Number((report as any).lateEntryCount)} financial {Number((report as any).lateEntryCount) === 1 ? 'entry was' : 'entries were'} recorded after this day closed. The DSSR snapshot is unchanged.</span>
            </div>
          )}

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
