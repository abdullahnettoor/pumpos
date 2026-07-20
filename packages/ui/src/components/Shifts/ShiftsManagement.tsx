import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { inr } from '../../utils/format.js';
import { CloudShiftService, CloudTransactionService } from '../../services/cloud.js';
import { ShiftSummaryView } from './ShiftSummaryView.js';
import { HandoverDrawer } from './HandoverDrawer.js';
import { ShiftControlBar } from './ShiftControlBar.js';
import { ShiftHistoryTab } from './ShiftHistoryTab.js';
import { CloseShiftWizard } from './CloseShiftWizard.js';
import { ShiftCloseSuccess } from './ShiftCloseSuccess.js';
import { AttendantHandoversDashboard } from './AttendantHandoversDashboard.js';
import { MerchandiseHandoversPanel } from './MerchandiseHandoversPanel.js';
import { NozzleReadingsGrid } from './NozzleReadingsGrid.js';
import { ShiftTotalsSummary } from './ShiftTotalsSummary.js';
import { BusinessDayTab } from './BusinessDayTab.js';
import { OpenShiftForm } from './OpenShiftForm.js';
import { Tabs } from '../primitives/Tabs.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useShiftStatus, useShiftTransactions, useInvalidateOperational, queryKeys } from '../../query/hooks.js';
import { openQuickEntry, useQuickEntry, type QuickEntryType } from '../../quick-entry/store.js';
import { Station, resolveBusinessDate } from '@pump/shared';
import { FileText, User, Lock, AlertTriangle, Check, Fuel, Info, Play, History, Clock3, CalendarRange } from 'lucide-react';
import { LoadingSpinner } from '../LoadingSpinner.js';

const shiftService = new CloudShiftService();
const transactionService = new CloudTransactionService();

interface ShiftTotals {
  cashCollections: number;
  cashExpenses: number;
  cardCollections: number;
  upiCollections: number;
  creditSales: number;
  expenseCount: number;
  purchaseCount: number;
  purchaseTotal: number;
}

/** Derive the live shift totals from a shift-transactions payload (pure). */
function computeShiftTotals(txs: any): ShiftTotals {
  const collections = txs?.collections ?? [];
  const expenses = txs?.expenses ?? [];
  const purchases = txs?.purchases ?? [];
  const byMethod = (method: string) =>
    collections.filter((c: any) => c.paymentMethod === method).reduce((sum: number, c: any) => sum + Number(c.amount), 0);
  return {
    cashCollections: byMethod('Cash'),
    cardCollections: byMethod('Card'),
    upiCollections: byMethod('UPI'),
    creditSales: (txs?.creditSales ?? []).reduce((sum: number, r: any) => sum + Number(r.amount), 0),
    cashExpenses: expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0),
    expenseCount: expenses.length,
    purchaseCount: purchases.length,
    purchaseTotal: purchases.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
  };
}

interface ShiftsManagementProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  onNavigate?: (path: string) => void;
}

export const ShiftsManagement: React.FC<ShiftsManagementProps> = ({
  selectedStation,
  userRole,
  userName,
  onNavigate,
}) => {
  const stationId = selectedStation?.id ?? null;
  const statusQ = useShiftStatus(stationId, false, { refetchOnWindowFocus: false });
  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const toast = useToast();
  const data = statusQ.data ?? null;
  const loading = statusQ.isLoading;
  const error = statusQ.error as Error | null;
  const [viewingShiftSummary, setViewingShiftSummary] = useState(false);

  // Shift Tab Sub-Navigation
  const [shiftSubTab, setShiftSubTab] = useState<'today' | 'business-day' | 'history'>('today');
  const [viewHistoryShiftId, setViewHistoryShiftId] = useState<string | null>(null);

  // Open Shift Form States
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [businessDate, setBusinessDate] = useState(() => resolveBusinessDate());
  const [openingCash, setOpeningCash] = useState(0);
  const [staffAssignments, setStaffAssignments] = useState<{ userId: string; duId: string }[]>([]);
  // Terminal→DU assignment for the shift being opened. duId '' means shift-wide (any DU).
  const [terminalAssignments, setTerminalAssignments] = useState<{ terminalId: string; duId: string }[]>([]);
  const [initialReadings, setInitialReadings] = useState<{ nozzleId: string; openingReading: number }[]>([]);
  const [isOpening, setIsOpening] = useState(false);

  // Default the shift-open business date to the station's *local* business date
  // (its timezone + day-start boundary), recomputed when the station changes.
  useEffect(() => {
    const s = (selectedStation?.settings ?? {}) as { timezone?: string; business_day_starts_at?: string };
    setBusinessDate(resolveBusinessDate({ timeZone: s.timezone, dayStartsAt: s.business_day_starts_at }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation?.id]);

  // Active Shift Workspace States
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});

  // Close Flow Inline States
  const [isPreparingClose, setIsPreparingClose] = useState(false);
  const [closeWizardOpen, setCloseWizardOpen] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [confirmWarningsChecked, setConfirmWarningsChecked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [stationTanks, setStationTanks] = useState<any[]>([]);
  const [dipReadings, setDipReadings] = useState<Record<string, number | string>>({});
  const [closedShiftSuccess, setClosedShiftSuccess] = useState<{
    expectedCash: number;
    closingCash: number;
    variance: number;
    lastClosedShiftId: string;
    nextTemplateId: string;
  } | null>(null);

  // Handover Drawer states
  const [handoverDrawerOpen, setHandoverDrawerOpen] = useState(false);
  const [selectedHandoverAssignment, setSelectedHandoverAssignment] = useState<any>(null);
  const [handoverCreditCustomers, setHandoverCreditCustomers] = useState<any[]>([]);

  const handleOpenHandoverDrawer = async (assignment: any) => {
    setSelectedHandoverAssignment(assignment);
    setHandoverDrawerOpen(true);
    // Refresh the vehicle/customer caches so newly-added records (created in
    // another tab/session) are pickable in the Customer Sales section.
    qc.invalidateQueries({ queryKey: ['vehicles'] });
    // Load customers pickable for on-account (Customer Sales) billing: all
    // customers except legacy station-prepaid non-fleet wallets. Prepaid Fleet
    // customers ARE included — they're OMC fleet cards (settled to CMS).
    try {
      const custList = await qc.fetchQuery({ queryKey: queryKeys.customers(true), queryFn: () => transactionService.getCustomers(true), staleTime: 0 });
      setHandoverCreditCustomers((custList || []).filter((c: any) => c.customerType === 'Fleet' || !c.isPrepaid));
    } catch {
      setHandoverCreditCustomers([]);
    }
  };

  // Quick entry is handled by the global QuickEntryHost (mounted at the app shell).
  // The control-bar actions just open it via the store; submission + cache
  // invalidation live in the host.
  const qe = useQuickEntry();

  // Live shift totals derive from a cached query so any operational mutation
  // (quick entry via the global host, handovers, etc.) refreshes them via
  // invalidateOperational — no manual reload wiring.
  const shiftTxQ = useShiftTransactions(data?.activeShift?.id ?? null);
  const shiftTotals = useMemo(() => computeShiftTotals(shiftTxQ.data), [shiftTxQ.data]);

  const openingCashNum = data?.activeShift ? Number(data.activeShift.openingCash) : 0;
  const handovers = data?.activeShift?.handovers || [];
  const hasHandovers = handovers.length > 0;

  const totalCashHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.cashHandedOver || 0), 0);
  const totalCardHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.cardHandedOver || 0), 0);
  const totalUpiHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.upiHandedOver || 0), 0);
  const totalCreditHandedOver = handovers.reduce((sum: number, h: any) => sum + Number(h.creditHandedOver || 0), 0);
  // Net attendant accountability variance (declared − meter-expected), summed
  // across handovers. Positive = surplus, negative = shortage.
  const totalAttendantVariance = handovers.reduce((sum: number, h: any) => sum + Number(h.varianceAmount || 0), 0);

  const activeCashCollections = hasHandovers ? totalCashHandedOver : shiftTotals.cashCollections;
  const activeCardCollections = hasHandovers ? totalCardHandedOver : shiftTotals.cardCollections;
  const activeUpiCollections = hasHandovers ? totalUpiHandedOver : shiftTotals.upiCollections;
  const activeCreditSales = hasHandovers ? totalCreditHandedOver : shiftTotals.creditSales;

  // Authoritative cash reconciliation from the server (same figures CloseShift
  // uses). Preferred over the client estimate so the expected drawer includes
  // non-attendant merchandise cash and reads the true station-level short/surplus.
  const recon = data?.activeShift?.reconciliation;
  const expectedCash = recon
    ? openingCashNum + Number(recon.cashSales || 0) + Number(recon.cashCollections || 0) - Number(recon.drawerExpenses || 0) - Number(recon.drawerSupplierPayments || 0)
    : openingCashNum + activeCashCollections - shiftTotals.cashExpenses;
  const cashVariance = closingCash - expectedCash;

  // Station-level cash summary for the closing wizard (#4). Aggregate figures —
  // cross-attendant settlements (e.g. a borrowed POS) net out in the drawer total.
  const cashSummary = recon
    ? {
        openingCash: openingCashNum,
        cashSales: Number(recon.cashSales || 0),
        handoverCash: Number(recon.handoverCash || 0),
        merchCashOutsideHandover: Number(recon.merchCashOutsideHandover || 0),
        cashCollections: Number(recon.cashCollections || 0),
        drawerExpenses: Number(recon.drawerExpenses || 0),
        drawerSupplierPayments: Number(recon.drawerSupplierPayments || 0),
        expectedDrawer: expectedCash,
        merchCashBreakdown: Array.isArray(recon.merchCashOutsideHandoverBreakdown) ? recon.merchCashOutsideHandoverBreakdown : [],
        attendantVariance: totalAttendantVariance,
        attendantVariances: handovers.map((h: any) => ({
          name: h.attendantName || h.userName || 'Attendant',
          du: h.duName || null,
          variance: Number(h.varianceAmount || 0),
        })),
        hasHandovers,
      }
    : null;

  // Reactively compute close warnings when close flow is active
  const warnings: string[] = [];

  if (data?.activeShift && isPreparingClose) {
    let zeroVolumeCount = 0;
    for (const nr of data.activeShift.nozzleReadings) {
      const opening = Number(nr.openingReading);
      const closing = closingReadings[nr.nozzleId] ?? opening;
      const volume = closing - opening;

      if (volume === 0) {
        zeroVolumeCount++;
      }
      if (volume > 5000) {
        warnings.push(`High volume alert: Nozzle ${nr.nozzleName} sold ${volume.toFixed(2)} ${nr.unit || 'L'}.`);
      }
    }

    if (zeroVolumeCount === data.activeShift.nozzleReadings.length) {
      warnings.push('Zero fuel volume was sold across all nozzles during this shift.');
    }

    // Check if all assigned attendants have recorded handovers
    const assignedStaff = data.activeShift.staffAssignments || [];
    for (const sa of assignedStaff) {
      const hasRecorded = handovers.some((h: any) => h.userId === sa.userId && h.duId === sa.duId);
      if (!hasRecorded) {
        warnings.push(`Handover not recorded for attendant ${sa.userName} on dispenser ${sa.duName || 'DU'}.`);
      }
    }

    // Mismatch check for credit chits vs customer bills
    const detailedCreditSum = shiftTotals.creditSales;
    if (hasHandovers && Math.abs(detailedCreditSum - totalCreditHandedOver) > 1.00) {
      warnings.push(`Credit Sales mismatch: Attendants declared ${inr(totalCreditHandedOver)} in chits, but only ${inr(detailedCreditSum)} of detailed customer billing has been logged in the transaction panel.`);
    }

    if (closingCash === 0 && expectedCash > 0) {
      warnings.push('Closing cash is ₹0, indicating no collections entered.');
    }
    if (Math.abs(cashVariance) > 100) {
      warnings.push(`Cash discrepancy detected! Variance is ${inr(cashVariance)} (Expected: ${inr(expectedCash)}, Entered: ${inr(closingCash)})`);
    }
  }

  // Quick entry opens the global QuickEntryHost. Minimize the close wizard first if
  // it's open (preserves its draft — the user can resume via "Continue Close").
  const launchQuickEntry = (type: QuickEntryType) => {
    if (closeWizardOpen) setCloseWizardOpen(false);
    openQuickEntry(type);
  };

  const triggerExpenseDrawer = () => launchQuickEntry('expense');
  const triggerCollectionDrawer = () => launchQuickEntry('collection');
  const triggerPurchaseDrawer = () => launchQuickEntry('purchase');
  const triggerMerchandiseSaleDrawer = () => launchQuickEntry('merchandise-sale');

  const quickEntryActions = [
    { key: 'expense', label: 'Add Expense', onClick: triggerExpenseDrawer, hotkey: 'E' },
    { key: 'collection', label: 'Log Collection', onClick: triggerCollectionDrawer, hotkey: 'C' },
    { key: 'merchandise-sale', label: 'Merchandise Sale', onClick: triggerMerchandiseSaleDrawer, hotkey: 'M' },
    { key: 'purchase', label: 'Add Purchase', onClick: triggerPurchaseDrawer, hotkey: 'P' },
  ];

  // Keyboard shortcuts (E/C/V/P) — active only on Today tab with an open shift and no other overlay focused.
  useEffect(() => {
    if (!data?.activeShift?.id) return;
    if (shiftSubTab !== 'today') return;
    if (viewingShiftSummary || viewHistoryShiftId) return;
    if (closeWizardOpen || qe.open || handoverDrawerOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      const k = e.key.toLowerCase();
      if (k === 'e') { e.preventDefault(); triggerExpenseDrawer(); }
      else if (k === 'c') { e.preventDefault(); triggerCollectionDrawer(); }
      else if (k === 'm') { e.preventDefault(); triggerMerchandiseSaleDrawer(); }
      else if (k === 'p') { e.preventDefault(); triggerPurchaseDrawer(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [data?.activeShift?.id, shiftSubTab, viewingShiftSummary, viewHistoryShiftId, closeWizardOpen, qe.open, handoverDrawerOpen]);

  // Initialise the open/close-form state whenever the cached shift status
  // changes (mount + after a mutation invalidates the cache).
  useEffect(() => {
    const statusData = statusQ.data;
    if (!statusData || !selectedStation) return;

    if (statusData.templates && statusData.templates.length > 0) {
      setSelectedTemplateId((prev: string) => prev || statusData.templates[0].id);
    }
    if (statusData.dispensers) {
      setStaffAssignments(
        statusData.dispensers.map((du: any) => ({ duId: du.id, userId: statusData.staff?.[0]?.id ?? '' })),
      );
    }
    if (statusData.terminals) {
      setTerminalAssignments(
        statusData.terminals.map((t: any) => ({ terminalId: t.id, duId: '' })),
      );
    }
    if (statusData.nozzles) {
      setInitialReadings(
        statusData.nozzles.map((nz: any) => ({ nozzleId: nz.id, openingReading: Number(nz.currentReading) })),
      );
      if (statusData.activeShift && statusData.activeShift.nozzleReadings) {
        const readingsMap: Record<string, number> = {};
        statusData.activeShift.nozzleReadings.forEach((nr: any) => {
          readingsMap[nr.nozzleId] = Number(nr.closingReading);
        });
        setClosingReadings(readingsMap);
        // Tank status for physical dip entry at close time.
        transactionService
          .getInventoryStatus(selectedStation.id)
          .then((tanksData) => {
            setStationTanks(tanksData || []);
            setDipReadings({});
          })
          .catch((tankErr) => console.error('Failed to load tanks for physical dip entry:', tankErr));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQ.data]);

  // Refreshing the shift workspace = invalidating the shared shift-status cache;
  // the query refetches and the init effect above re-runs.
  const loadShiftStatus = () => invalidateOperational(stationId);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      setIsOpening(true);
      const payload: any = {
        stationId: selectedStation.id,
        shiftTemplateId: selectedTemplateId,
        businessDate,
        openingCash,
        staffAssignments: staffAssignments.filter((a) => a.userId !== ''),
        terminalLinks: terminalAssignments.map((t) => ({ terminalId: t.terminalId, duId: t.duId || null })),
      };

      // If no last shift exists, send the manual override initial readings
      if (!data.lastShift) {
        payload.initialReadings = initialReadings;
      }

      await shiftService.openShift(payload);
      await loadShiftStatus();
      toast.success('Shift opened.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to open shift');
    } finally {
      setIsOpening(false);
    }
  };

  const handleStaffAssignmentChange = (duId: string, userId: string) => {
    setStaffAssignments((prev) =>
      prev.map((a) => (a.duId === duId ? { ...a, userId } : a))
    );
  };

  const handleTerminalAssignmentChange = (terminalId: string, duId: string) => {
    setTerminalAssignments((prev) =>
      prev.map((t) => (t.terminalId === terminalId ? { ...t, duId } : t))
    );
  };

  const handleInitialReadingChange = (nozzleId: string, openingReading: number) => {
    setInitialReadings((prev) =>
      prev.map((r) => (r.nozzleId === nozzleId ? { ...r, openingReading } : r))
    );
  };

  const handleClosingReadingChange = (nozzleId: string, val: number) => {
    setClosingReadings((prev) => ({
      ...prev,
      [nozzleId]: val,
    }));
  };

  const handlePrepareClose = () => {
    if (!data.activeShift) return;

    // Perform validation checks
    for (const nr of data.activeShift.nozzleReadings) {
      const opening = Number(nr.openingReading);
      const closing = closingReadings[nr.nozzleId] ?? opening;

      if (closing < opening) {
        toast.error(`Closing reading for nozzle ${nr.nozzleName} (${closing}) cannot be less than opening reading (${opening})`);
        return;
      }
    }

    setConfirmWarningsChecked(false);
    setIsPreparingClose(true);
    setCloseWizardOpen(true);
  };


  const handleCloseShift = async () => {
    if (!data.activeShift) return;
    try {
      setIsClosing(true);
      const readingsArray = Object.entries(closingReadings).map(([nozzleId, closingReading]) => ({
        nozzleId,
        closingReading,
      }));

      const dipReadingsArray = Object.entries(dipReadings)
        .filter(([_, actualQuantity]) => actualQuantity !== undefined && actualQuantity !== null && actualQuantity !== '')
        .map(([tankId, actualQuantity]) => ({
          tankId,
          actualQuantity: Number(actualQuantity),
        }));

      // Calculate expected, actual, variance and nextTemplateId before closing
      const expected = expectedCash;
      const actual = closingCash;
      const variance = cashVariance;
      const closedId = data.activeShift.id;

      let nextTemplateId = '';
      if (data?.templates && data.templates.length > 0 && data?.activeShift) {
        const currentIdx = data.templates.findIndex((t: any) => t.id === data.activeShift.shiftTemplateId);
        if (currentIdx !== -1) {
          nextTemplateId = data.templates[(currentIdx + 1) % data.templates.length].id;
        } else {
          nextTemplateId = data.templates[0].id;
        }
      }

      await shiftService.closeShift(data.activeShift.id, {
        closingCash,
        nozzleReadings: readingsArray,
        dipReadings: dipReadingsArray,
      });

      setIsPreparingClose(false);
      setCloseWizardOpen(false);
      await loadShiftStatus();

      setClosedShiftSuccess({
        expectedCash: expected,
        closingCash: actual,
        variance,
        lastClosedShiftId: closedId,
        nextTemplateId
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to close shift');
    } finally {
      setIsClosing(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to manage operational shifts.
      </div>
    );
  }

  if (loading) {
    return (
      <LoadingSpinner text="Resolving shift workspace states..." />
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)' }}>
        <strong>Error:</strong> {error.message || 'Failed to load shifts configuration'}
      </div>
    );
  }

  if (!data) {
    return <LoadingSpinner text="Resolving shift workspace states..." />;
  }

  const { activeShift, lastShift, lastDssr: lastShiftSummary, canReopenLastShift, gracePeriodExpiresAt, templates, nozzles, staff, dispensers, terminals } = data;
  const shiftScreenState: 'idle' | 'active' | 'closing' = activeShift
    ? (isPreparingClose ? 'closing' : 'active')
    : 'idle';

  const renderShiftSubTabs = () => (
    // Lift the tab strip above the sticky control-bar backdrop (z-20) so its
    // underline baseline is never masked by the backdrop at rest.
    <div style={{ position: 'relative', zIndex: 25 }}>
    <Tabs
      variant="underline"
      aria-label="Shift views"
      className="no-print"
      activeId={shiftSubTab}
      onChange={(id) => setShiftSubTab(id as 'today' | 'business-day' | 'history')}
      tabs={[
        {
          id: 'today',
          label: 'Active Shift',
          icon: <Clock3 size={13} />,
          badge: activeShift ? (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '8px',
                background: 'var(--state-success-bg)',
                color: 'var(--state-success-fg)',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Open
            </span>
          ) : undefined,
        },
        { id: 'business-day', label: 'Business Day', icon: <CalendarRange size={13} /> },
        { id: 'history', label: 'History', icon: <History size={13} /> },
      ]}
    />
    </div>
  );

  // Sub-tab: Business Day (read-only day cockpit)
  if (shiftSubTab === 'business-day') {
    return (
      <div
        className="animate-fade-in"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-sans)' }}
      >
        {renderShiftSubTabs()}
        <BusinessDayTab selectedStation={selectedStation} userRole={userRole} />
      </div>
    );
  }

  // Sub-tab: History
  if (shiftSubTab === 'history') {
    return (
      <div
        className="animate-fade-in"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-sans)' }}
      >
        {renderShiftSubTabs()}
        <ShiftHistoryTab
          selectedStation={selectedStation}
          userRole={userRole}
          viewShiftId={viewHistoryShiftId}
          onClearViewShiftId={() => setViewHistoryShiftId(null)}
        />
      </div>
    );
  }


  // Render Success Screen if set
  if (closedShiftSuccess) {
    return (
      <ShiftCloseSuccess
        result={closedShiftSuccess}
        onStartNext={() => {
          setOpeningCash(closedShiftSuccess.closingCash);
          setSelectedTemplateId(closedShiftSuccess.nextTemplateId);
          setClosedShiftSuccess(null);
          setViewingShiftSummary(false);
        }}
        onViewSummary={() => {
          setViewHistoryShiftId(closedShiftSuccess.lastClosedShiftId);
          setShiftSubTab('history');
          setClosedShiftSuccess(null);
        }}
        onBack={() => {
          setClosedShiftSuccess(null);
          setViewingShiftSummary(false);
        }}
      />
    );
  }

  // Render Shift Summary View if toggled
  if (viewingShiftSummary && lastShiftSummary) {
    return (
      <ShiftSummaryView
        shiftSummary={lastShiftSummary}
        userRole={userRole}
        canReopen={canReopenLastShift}
        gracePeriodExpiresAt={gracePeriodExpiresAt}
        shiftStatus={lastShift?.status}
        station={selectedStation}
        onTransactionAdded={loadShiftStatus}
        onReopenSuccess={() => {
          setViewingShiftSummary(false);
          loadShiftStatus();
        }}
        onBack={() => setViewingShiftSummary(false)}
      />
    );
  }

  // Render Active Shift Workspace
  if (shiftScreenState === 'active' || shiftScreenState === 'closing') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-sans)' }}>
        {renderShiftSubTabs()}
        <ShiftControlBar
          activeShift={activeShift}
          shiftTotals={shiftTotals}
          handoversCompleted={handovers.length}
          handoversAssigned={activeShift.staffAssignments?.length || 0}
          quickActions={quickEntryActions}
          onCloseShiftClick={() => {
            if (isPreparingClose) {
              setCloseWizardOpen(true);
            } else {
              handlePrepareClose();
            }
          }}
          isPreparingClose={shiftScreenState === 'closing'}
          onViewLastShiftSummary={lastShiftSummary ? () => {
            setViewHistoryShiftId(lastShiftSummary.shiftId);
            setShiftSubTab('history');
          } : undefined}
        />

        {/* 1. Merchandise Handovers (walk-in bulk, per employee) */}
        <MerchandiseHandoversPanel
          shiftId={activeShift.id}
          stationId={selectedStation?.id ?? null}
          onChanged={loadShiftStatus}
          initialHandovers={data?.activeShift?.merchandiseHandovers}
          initialSales={data?.activeShift?.merchandiseSales}
        />

        {/* 2. Attendant (DU) Handovers Dashboard */}
        <AttendantHandoversDashboard
          staffAssignments={activeShift.staffAssignments}
          handovers={handovers}
          onRecordHandover={handleOpenHandoverDrawer}
        />

        {/* 3. Nozzle Readings Grid (fuel sales preview) */}
        <NozzleReadingsGrid
          nozzleReadings={activeShift.nozzleReadings}
          closingReadings={closingReadings}
          staffAssignments={data?.activeShift?.staffAssignments || []}
        />

        {/* 4. Shift Totals Summary Card (KPI) */}
        <ShiftTotalsSummary
          shiftTotals={shiftTotals}
          cashCollections={activeCashCollections}
          cardCollections={activeCardCollections}
          upiCollections={activeUpiCollections}
          creditSales={activeCreditSales}
          handoverCount={handovers.length}
        />

        {/* Close Shift Wizard (Drawer) */}
        <CloseShiftWizard
          isOpen={closeWizardOpen}
          onClose={() => {
            setCloseWizardOpen(false);
            // Keep isPreparingClose=true so the control bar shows "Continue Close"
            // User cancels explicitly via the wizard's Cancel button only on step 1
            // and we only fully exit close mode if they haven't made progress.
            if (closingCash === 0 && Object.keys(dipReadings).length === 0) {
              setIsPreparingClose(false);
              setConfirmWarningsChecked(false);
            }
          }}
          shiftTemplateName={activeShift.templateName}
          openedAt={activeShift.openedAt}
          openingCash={openingCashNum}
          cashCollections={activeCashCollections}
          cashExpenses={shiftTotals.cashExpenses}
          expectedCash={expectedCash}
          closingCash={closingCash}
          onClosingCashChange={setClosingCash}
          cashSummary={cashSummary}
          stationTanks={stationTanks}
          dipReadings={dipReadings}
          onDipReadingsChange={setDipReadings}
          warnings={warnings}
          confirmWarningsChecked={confirmWarningsChecked}
          onConfirmWarningsChange={setConfirmWarningsChecked}
          isClosing={isClosing}
          onConfirmClose={() => handleCloseShift()}
        />

        {selectedHandoverAssignment && (
          <HandoverDrawer
            isOpen={handoverDrawerOpen}
            onClose={() => {
              setHandoverDrawerOpen(false);
              setSelectedHandoverAssignment(null);
            }}
            shiftId={activeShift.id}
            stationId={stationId}
            userId={selectedHandoverAssignment.userId}
            userName={selectedHandoverAssignment.userName}
            duId={selectedHandoverAssignment.duId}
            duCode={selectedHandoverAssignment.duCode || selectedHandoverAssignment.duName}
            nozzles={activeShift.nozzleReadings.filter(
              (nr: any) => nr.duId === selectedHandoverAssignment.duId
            )}
            terminals={(activeShift.terminalLinks || []).filter(
              (t: any) => t.duId === selectedHandoverAssignment.duId || t.duId == null
            )}
            customers={handoverCreditCustomers}
            merchandiseCash={
              Number(
                (activeShift.staffAssignments || []).find(
                  (sa: any) => sa.userId === selectedHandoverAssignment.userId,
                )?.attributed?.merchandiseCash ?? 0,
              )
            }
            merchandiseNonCash={
              (() => {
                const a = (activeShift.staffAssignments || []).find(
                  (sa: any) => sa.userId === selectedHandoverAssignment.userId,
                )?.attributed;
                return Number(a?.merchandiseCard ?? 0) + Number(a?.merchandiseUpi ?? 0);
              })()
            }
            creditSales={
              (activeShift.staffAssignments || []).find(
                (sa: any) => sa.userId === selectedHandoverAssignment.userId && sa.duId === selectedHandoverAssignment.duId,
              )?.creditSales || selectedHandoverAssignment.creditSales || []
            }
            omcSales={
              (activeShift.staffAssignments || []).find(
                (sa: any) => sa.userId === selectedHandoverAssignment.userId && sa.duId === selectedHandoverAssignment.duId,
              )?.omcSales || selectedHandoverAssignment.omcSales || []
            }
            onCreditChanged={async () => {
              await loadShiftStatus();
            }}
            existingHandover={activeShift.handovers?.find(
              (h: any) => h.userId === selectedHandoverAssignment.userId && h.duId === selectedHandoverAssignment.duId
            )}
            onSaveSuccess={async () => {
              await loadShiftStatus();
            }}
          />
        )}
      </div>
    );
  }

  // Render Open Shift Form
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-sans)' }}>
      {renderShiftSubTabs()}
      <OpenShiftForm
        lastShiftSummary={lastShiftSummary}
        lastShift={lastShift}
        templates={templates}
        dispensers={dispensers}
        staff={staff}
        nozzles={nozzles}
        terminals={terminals}
        terminalAssignments={terminalAssignments}
        onTerminalAssignmentChange={handleTerminalAssignmentChange}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
        businessDate={businessDate}
        onBusinessDateChange={setBusinessDate}
        openingCash={openingCash}
        onOpeningCashChange={setOpeningCash}
        staffAssignments={staffAssignments}
        onStaffAssignmentChange={handleStaffAssignmentChange}
        initialReadings={initialReadings}
        onInitialReadingChange={handleInitialReadingChange}
        isOpening={isOpening}
        onSubmit={handleOpenShift}
        onViewLastShiftSummary={() => {
          setViewHistoryShiftId(lastShiftSummary.shiftId);
          setShiftSubTab('history');
        }}
      />
    </div>
  );
};
