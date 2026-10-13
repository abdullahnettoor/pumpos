import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavIntentEntry, clearNavIntent } from '../nav-intent/store.js';
import type { ColumnDef } from '@tanstack/react-table';
import { CloudShiftService } from '../services/cloud.js';
import { useDailyDssrRange } from '../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { DailyDssrView } from './DailyDssrView.js';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { DateField } from './primitives/Field.js';
import { ExpenseRegister } from './reports/ExpenseRegister.js';
import { LedgersReport } from './reports/LedgersReport.js';
import { InvoicesPanel } from './reports/InvoicesPanel.js';
import { GstReport } from './reports/gst/GstReport.js';
import { ReportsNav, type ReportsNavGroup } from './reports/ReportsNav.js';
import { ProfitLossView } from './reports/ProfitLossView.js';
import { AttendantHandoverReportPanel } from './reports/AttendantHandoverReportPanel.js';
import { DecantationReportPanel } from './reports/DecantationReportPanel.js';
import { useCapability } from '../access/CapabilityGate.js';
import {
  ATTENDANT_REPORT_CAPABILITY,
  deriveDssrRangeKpis,
  readDssrCashSales,
  readDssrNetVolume,
  readSnapshot,
  canViewAttendantReport,
  canViewReports,
} from '@pump/shared';
import { formatQty, inr } from '../utils/format.js';
import { resolveBusinessDate } from '@pump/shared';
import { Panel, Button, KpiStrip, KpiTile, EmptyState, DateText } from '../pump-ds/index.js';
import { Play, Zap } from 'lucide-react';
import { useRunTask } from '../utils/runTask.js';

const shiftService = new CloudShiftService();

const dssrColumns: ColumnDef<any, any>[] = [
  {
    accessorKey: 'businessDate',
    header: 'Business Date',
    cell: ({ getValue }) => <DateText value={getValue() as string} />,
  },
  {
    id: 'shifts',
    header: 'Shifts',
    cell: ({ row }) => (
      <span style={{ color: 'var(--text-default)' }}>
        {Number(row.original.snapshotData?.shiftsIncluded || 0)}
      </span>
    ),
  },
  {
    id: 'volume',
    header: 'Net Volume Sold',
    cell: ({ row }) => {
      const perUnit = Object.entries(readDssrNetVolume(readSnapshot(row.original)));
      const label =
        perUnit.map(([unit, qty]) => formatQty(qty, 2, unit)).join(' · ') || formatQty(0, 2, 'L');
      return (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>
          {label}
        </span>
      );
    },
  },
  {
    // Per-day source of the "Cash sales" tile. Days frozen before #516 carry no
    // figure and read "—" until regenerated, never ₹0.
    id: 'cashSales',
    header: 'Cash sales',
    cell: ({ row }) => {
      const cash = readDssrCashSales(readSnapshot(row.original));
      return (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>
          {cash == null ? '—' : inr(cash)}
        </span>
      );
    },
  },
  {
    id: 'grossMargin',
    header: 'Gross Margin',
    cell: ({ row }) => (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          color: 'var(--state-success-fg)',
        }}
      >
        {inr(row.original.snapshotData?.pnl?.grossMargin || 0)}
      </span>
    ),
  },
];

interface ReportsOverviewProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
}

/**
 * Reports, grouped (#540). The Daily cash book moved to Accounts and Report
 * templates to Station; GST is one report (sales · purchases · income) and
 * Ledgers holds the party ledger and the cash & bank period view.
 */
type ReportsTab =
  | 'daily-dssr'
  | 'attendant-handovers'
  | 'decantations'
  | 'pnl'
  | 'ledger'
  | 'invoices'
  | 'gst'
  | 'expense-register';

export const ReportsOverview: React.FC<ReportsOverviewProps> = ({ selectedStation, userRole }) => {
  const qc = useQueryClient();
  const runTask = useRunTask();
  const stationId = selectedStation?.id ?? null;
  const s = selectedStation?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };

  const [selectedTab, setSelectedTab] = useState<ReportsTab>('daily-dssr');
  // One decision drives both the tab and its panel, so they cannot disagree.
  const attendantReport = useCapability(ATTENDANT_REPORT_CAPABILITY);
  /*
   * Two axes, as the server checks them. The Role must allow it, or the tab
   * would 403 on click. The capability may be `upgrade` rather than `enabled`:
   * a Role that may be told about it still sees the tab, and the panel renders
   * the explanatory unavailable state instead of silence. `hidden` — access
   * unknown, or not this user's concern — shows nothing at all.
   */
  const showAttendantReport =
    canViewAttendantReport(userRole) && attendantReport.status !== 'hidden';
  const { intent, token: intentToken } = useNavIntentEntry();
  const activeTab: ReportsTab = intent?.openDssrDate
    ? 'daily-dssr'
    : intent?.openReportsTab === 'gst'
      ? 'gst'
      : selectedTab;
  const setActiveTab = (tab: ReportsTab) => {
    clearNavIntent();
    setSelectedTab(tab);
  };
  const [activeDailyDssr, setActiveDailyDssr] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    resolveBusinessDate({ timeZone: clock.timeZone, dayStartsAt: clock.dayStartsAt }),
  );
  const [generatingDailyDssr, setGeneratingDailyDssr] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Rolling 30-day window for the DSSR list, anchored to the station's business date.
  const { from, to } = useMemo(() => {
    const toD = resolveBusinessDate({ timeZone: clock.timeZone, dayStartsAt: clock.dayStartsAt });
    const d = new Date(`${toD}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 30);
    return { from: d.toISOString().split('T')[0], to: toD };
  }, [clock.timeZone, clock.dayStartsAt]);

  const dssrQ = useDailyDssrRange(stationId, from, to, {
    enabled: !!stationId && activeTab === 'daily-dssr',
  } as any);
  // Memoised so `kpis` below actually memoises: a bare `?? []` hands the
  // dependency list a new array on every render while the query is loading.
  const dssrList = useMemo(() => dssrQ.data ?? [], [dssrQ.data]);

  // Read through the shared DSSR reader (#516): the component never sums raw keys.
  const kpis = useMemo(() => deriveDssrRangeKpis(dssrList), [dssrList]);

  // Deep-link: opening a past business day from the top-bar anchor dropdown.
  // Uses the on-the-fly preview so it works whether or not a snapshot exists.
  // The only consumer that still needs an effect, because it performs I/O — but
  // the tab is derived like everywhere else, and the guard is now the store's
  // token rather than the date string. The old date-keyed ref silently ignored
  // a second navigation to the same day.
  const handledTokenRef = useRef<number | null>(null);
  useEffect(() => {
    const date = intent?.openDssrDate;
    if (!date || !stationId) return;
    if (handledTokenRef.current === intentToken) return;
    handledTokenRef.current = intentToken;
    let cancelled = false;
    runTask(
      (async () => {
        try {
          const result = await shiftService.getDailyDssrPreview(stationId, date);
          if (!cancelled) setActiveDailyDssr(result);
        } catch {
          // No snapshot for that day yet: fall back to selecting it so the
          // operator can generate one.
          if (!cancelled) setSelectedDate(date);
        } finally {
          // Commit the tab before dropping the intent that derived it, or a
          // Reports page already on another report snaps back to it.
          setSelectedTab('daily-dssr');
          clearNavIntent();
        }
      })(),
      'Could not open the report for that day.',
    );
    return () => {
      cancelled = true;
    };
  }, [intent?.openDssrDate, intentToken, stationId, runTask]);

  const handleGenerateDailyDssr = async () => {
    if (!selectedStation || !selectedDate) return;
    try {
      setGeneratingDailyDssr(true);
      setGenerateError(null);
      const result = await shiftService.generateDailyDssr(selectedStation.id, selectedDate);
      // The list is a cached query — invalidate so the new snapshot appears.
      await qc.invalidateQueries({ queryKey: ['dssr-range'] });
      setActiveDailyDssr(result);
    } catch (err: any) {
      setGenerateError(err.message || 'Failed to generate daily DSSR');
    } finally {
      setGeneratingDailyDssr(false);
    }
  };

  const navGroups: ReportsNavGroup<ReportsTab>[] = [
    {
      heading: 'Sales',
      items: [
        { id: 'daily-dssr', label: 'DSSR', concept: 'dssr' },
        ...(showAttendantReport
          ? [
              {
                id: 'attendant-handovers' as const,
                label: 'Attendant handovers',
                concept: 'attendant-handovers' as const,
              },
            ]
          : []),
        ...(canViewReports(userRole)
          ? [
              {
                id: 'decantations' as const,
                label: 'Decantations',
                concept: 'decantations' as const,
              },
            ]
          : []),
      ],
    },
    {
      heading: 'Finance',
      items: [
        ...(userRole === 'Owner'
          ? [{ id: 'pnl' as const, label: 'Profit & loss', concept: 'profit-loss' as const }]
          : []),
        { id: 'ledger', label: 'Ledgers', concept: 'ledgers' },
        { id: 'invoices', label: 'Invoices', concept: 'invoices' },
      ],
    },
    {
      heading: 'Tax & registers',
      items: [
        { id: 'gst', label: 'GST', concept: 'gst' },
        { id: 'expense-register', label: 'Expense register', concept: 'expense-register' },
      ],
    },
  ];

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view reports.
      </div>
    );
  }

  if (activeDailyDssr) {
    return (
      <div className="animate-fade-in">
        <DailyDssrView
          dailyDssr={activeDailyDssr}
          station={selectedStation}
          onBack={() => setActiveDailyDssr(null)}
        />
      </div>
    );
  }

  return (
    <PageLayout
      title="Reports"
      subtitle="Daily sales summaries, profit & loss, ledgers, and tax registers."
    >
      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-4">
        <ReportsNav groups={navGroups} activeId={activeTab} onChange={setActiveTab} />
        <div className="min-w-0">
          {/* Daily DSSR Tab */}
          {activeTab === 'daily-dssr' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <KpiStrip columns="auto">
                <KpiTile
                  dot="brand"
                  label="Generated DSSRs"
                  value={String(kpis.count)}
                  hint="last 30 days"
                />
                <KpiTile
                  dot="info"
                  label="Net Volume Sold"
                  value={kpis.volumeLabel}
                  hint="period"
                />
                {/* Cash received for sales by shift Drawers. Collections are Office
                    Records (ADR 0005) and live in the Daily Cash Book. */}
                <KpiTile
                  dot="success"
                  label="Cash sales"
                  value={kpis.cashSales == null ? '—' : inr(kpis.cashSales)}
                  hint={
                    kpis.daysWithoutCash > 0
                      ? `${kpis.daysWithoutCash} older ${kpis.daysWithoutCash === 1 ? 'day' : 'days'} not counted`
                      : 'period'
                  }
                />
              </KpiStrip>

              <Panel title="Generate a daily snapshot">
                <div
                  style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}
                >
                  <div style={{ maxWidth: '220px' }}>
                    <label className="field-label">Business Date</label>
                    <DateField
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Play style={{ fill: 'currentColor' }} />}
                    loading={generatingDailyDssr}
                    disabled={!selectedDate}
                    onClick={handleGenerateDailyDssr}
                  >
                    Generate DSSR
                  </Button>
                </div>
                {generateError && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      backgroundColor: 'var(--state-danger-bg)',
                      color: 'var(--state-danger-fg)',
                      borderRadius: 'var(--radius-input)',
                      fontSize: '12px',
                    }}
                  >
                    {generateError}
                  </div>
                )}
              </Panel>

              <Panel flush title="Recent DSSRs">
                {dssrQ.isLoading ? (
                  <div style={{ padding: '16px' }}>
                    <EmptyState
                      compact
                      icon={<Zap />}
                      title="Loading…"
                      description="Fetching recent daily snapshots."
                    />
                  </div>
                ) : dssrList.length === 0 ? (
                  <div style={{ padding: '12px' }}>
                    <EmptyState
                      compact
                      icon={<Zap />}
                      title="No daily DSSR reports"
                      description="Generate a daily snapshot above to get started."
                    />
                  </div>
                ) : (
                  <DataTable
                    bare
                    columns={dssrColumns}
                    data={dssrList}
                    error={dssrQ.error}
                    title="daily reports"
                    onRetry={dssrQ.refetch}
                    emptyMessage="No daily DSSR reports."
                    getRowId={(r: any) => r.id}
                    onRowClick={(r: any) => setActiveDailyDssr(r)}
                    initialSorting={[{ id: 'businessDate', desc: true }]}
                  />
                )}
              </Panel>
            </div>
          )}

          {activeTab === 'ledger' && <LedgersReport selectedStation={selectedStation} />}

          {activeTab === 'pnl' && userRole === 'Owner' && (
            <ProfitLossView selectedStation={selectedStation} />
          )}

          {activeTab === 'invoices' && (
            <InvoicesPanel selectedStation={selectedStation} userRole={userRole} />
          )}

          {activeTab === 'gst' && (
            <GstReport
              selectedStation={selectedStation}
              initialView={intent?.openReportsTab === 'gst' ? intent.openGstView : undefined}
              onViewChange={() => {
                // Commit the durable half (we are on GST) before clearing the
                // deep link that derived it — clearing alone falls back to DSSR.
                setSelectedTab('gst');
                clearNavIntent();
              }}
            />
          )}

          {activeTab === 'expense-register' && (
            <ExpenseRegister selectedStation={selectedStation} />
          )}

          {activeTab === 'attendant-handovers' && showAttendantReport && (
            <AttendantHandoverReportPanel selectedStation={selectedStation} />
          )}

          {activeTab === 'decantations' && canViewReports(userRole) && (
            <DecantationReportPanel selectedStation={selectedStation} />
          )}
        </div>
      </div>
    </PageLayout>
  );
};
