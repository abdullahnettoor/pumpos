import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavIntentEntry, clearNavIntent } from '../nav-intent/store.js';
import type { ColumnDef } from '@tanstack/react-table';
import { CloudShiftService } from '../services/cloud.js';
import { useDailyDssrRange } from '../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { DailyDssrView } from './DailyDssrView.js';
import { PageLayout } from './primitives/PageLayout.js';
import { Tabs } from './primitives/Tabs.js';
import { DataTable } from './primitives/DataTable.js';
import { DateField } from './primitives/Field.js';
import { ExpenseRegister } from './reports/ExpenseRegister.js';
import { CashBankLedger } from './reports/CashBankLedger.js';
import { DailyCashBook } from './reports/DailyCashBook.js';
import { UnifiedLedger } from './reports/UnifiedLedger.js';
import { InvoicesPanel } from './reports/InvoicesPanel.js';
import { TaxRegisterPanel } from './reports/TaxRegisterPanel.js';
import { ProfitLossView } from './reports/ProfitLossView.js';
import { AttendantHandoverReportPanel } from './reports/AttendantHandoverReportPanel.js';
import { useCapability } from '../access/CapabilityGate.js';
import { ATTENDANT_REPORT_CAPABILITY, canViewAttendantReport } from '@pump/shared';
import { inr } from '../utils/format.js';
import { resolveBusinessDate } from '@pump/shared';
import { Panel, Button, KpiStrip, KpiTile, EmptyState, DateText } from '../pump-ds/index.js';
import {
  Play,
  Zap,
  Receipt,
  Wallet,
  BookOpen,
  FileText,
  TrendingUp,
  Percent,
  Users,
  BookText,
} from 'lucide-react';
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
      const snap = row.original.snapshotData || {};
      const bp = (snap.fuel?.byProduct || []) as any[];
      const units = Array.from(new Set(bp.map((p: any) => p.unit || 'L')));
      const vol = Number(snap.fuel?.totalNetVolume ?? snap.totalVolumeSold ?? 0);
      const label = units.length === 1 ? units[0] : units.length > 1 ? '' : 'L';
      return (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>
          {vol.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {label ? ` ${label}` : ''}
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

type ReportsTab =
  | 'daily-dssr'
  | 'pnl'
  | 'ledger'
  | 'invoices'
  | 'tax-register'
  | 'expense-register'
  | 'cash-bank'
  | 'cash-book'
  | 'attendant-handovers';

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
  const activeTab: ReportsTab = intent?.openDssrDate ? 'daily-dssr' : selectedTab;
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

  const kpis = useMemo(() => {
    let volume = 0;
    let cash = 0;
    for (const d of dssrList) {
      const x = d.snapshotData || {};
      volume += Number(x.totalVolumeSold || 0);
      cash += Number(x.totalCashCollections || 0);
    }
    return { count: dssrList.length, volume, cash };
  }, [dssrList]);

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
      toolbar={
        <Tabs
          variant="underline"
          aria-label="Reports"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as ReportsTab)}
          tabs={[
            { id: 'daily-dssr', label: 'Daily DSSR', icon: <Zap size={13} /> },
            ...(userRole === 'Owner'
              ? [{ id: 'pnl', label: 'Profit & Loss', icon: <TrendingUp size={13} /> }]
              : []),
            { id: 'ledger', label: 'Ledger', icon: <BookOpen size={13} /> },
            { id: 'invoices', label: 'Invoices', icon: <FileText size={13} /> },
            { id: 'tax-register', label: 'Tax Register', icon: <Percent size={13} /> },
            ...(userRole !== 'Staff'
              ? [{ id: 'cash-book', label: 'Daily Cash Book', icon: <BookText size={13} /> }]
              : []),
            { id: 'cash-bank', label: 'Cash & Bank', icon: <Wallet size={13} /> },
            { id: 'expense-register', label: 'Expense Register', icon: <Receipt size={13} /> },
            ...(showAttendantReport
              ? [
                  {
                    id: 'attendant-handovers',
                    label: 'Attendant Handovers',
                    icon: <Users size={13} />,
                  },
                ]
              : []),
          ]}
        />
      }
    >
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
              value={`${kpis.volume.toLocaleString('en-IN', { maximumFractionDigits: 0 })} L`}
              hint="period"
            />
            <KpiTile dot="success" label="Cash Collected" value={inr(kpis.cash)} hint="period" />
          </KpiStrip>

          <Panel title="Generate a daily snapshot">
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ maxWidth: '220px' }}>
                <label className="field-label">Business Date</label>
                <DateField value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
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
                emptyMessage="No daily DSSR reports."
                getRowId={(r: any) => r.id}
                onRowClick={(r: any) => setActiveDailyDssr(r)}
                initialSorting={[{ id: 'businessDate', desc: true }]}
              />
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'ledger' && <UnifiedLedger selectedStation={selectedStation} />}

      {activeTab === 'pnl' && userRole === 'Owner' && (
        <ProfitLossView selectedStation={selectedStation} />
      )}

      {activeTab === 'invoices' && (
        <InvoicesPanel selectedStation={selectedStation} userRole={userRole} />
      )}
      {activeTab === 'tax-register' && <TaxRegisterPanel selectedStation={selectedStation} />}

      {activeTab === 'expense-register' && <ExpenseRegister selectedStation={selectedStation} />}

      {activeTab === 'cash-book' && userRole !== 'Staff' && (
        <DailyCashBook selectedStation={selectedStation} />
      )}

      {activeTab === 'cash-bank' && <CashBankLedger selectedStation={selectedStation} />}

      {activeTab === 'attendant-handovers' && showAttendantReport && (
        <AttendantHandoverReportPanel selectedStation={selectedStation} />
      )}
    </PageLayout>
  );
};
