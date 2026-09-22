import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useNavIntent, clearNavIntent } from '../../nav-intent/store.js';
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
import { useRunTask } from '../../utils/runTask.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import {
  useShiftStatus,
  useShiftTransactions,
  useInventoryStatus,
  useInvalidateOperational,
  queryKeys,
} from '../../query/hooks.js';
import {
  applyPendingTankDips,
  createStockCountIdempotencyKey,
  discardUnrecordedTankDips,
  isAmbiguousMutationError,
  loadPendingTankDipWorkflow,
  savePendingTankDipWorkflow,
  shouldResetTankDipDraft,
  type PendingTankDipWorkflow,
} from '../../query/stockCountMutation.js';
import { openQuickEntry, useQuickEntry, type QuickEntryType } from '../../quick-entry/store.js';
import { Station } from '@pump/shared';
import type { OpenShiftFormValues } from '@pump/shared';
import {
  FileText,
  User,
  Lock,
  AlertTriangle,
  Check,
  Fuel,
  Info,
  Play,
  History,
  Clock3,
  CalendarRange,
} from 'lucide-react';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { useStationBusinessDate } from '../../hooks/useStationBusinessDate.js';
import { refreshShiftStatus } from './refreshShiftStatus.js';

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
    collections
      .filter((c: any) => c.paymentMethod === method)
      .reduce((sum: number, c: any) => sum + Number(c.amount), 0);
  return {
    cashCollections: byMethod('Cash'),
    cardCollections: byMethod('Card'),
    upiCollections: byMethod('UPI'),
    creditSales: (txs?.creditSales ?? []).reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0,
    ),
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
  const stationSettings = (selectedStation?.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const currentBusinessDate = useStationBusinessDate(
    stationSettings.timezone,
    stationSettings.business_day_starts_at,
  );
  const statusQ = useShiftStatus(stationId, false, { refetchOnWindowFocus: false });
  const invalidateOperational = useInvalidateOperational();
  const runTask = useRunTask();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const data = statusQ.data ?? null;
  const loading = statusQ.isLoading;
  const error = statusQ.error;
  const [viewingShiftSummary, setViewingShiftSummary] = useState(false);

  // Shift Tab Sub-Navigation
  const [selectedSubTab, setSelectedSubTab] = useState<'today' | 'business-day' | 'history'>(
    userRole === 'Accountant' ? 'business-day' : 'today',
  );
  const [selectedBusinessDayDate, setSelectedBusinessDayDate] = useState<string | null>(null);
  // Deep link from the top-bar business-day pill. Derived rather than synced by
  // an effect; this consumer had no re-fire guard at all and relied purely on
  // the parent nulling the prop in time.
  const intent = useNavIntent();
  const intentBusinessDay = intent?.openBusinessDayDate ?? null;
  // Deep link to one closed shift's summary (dashboard "Last closed shift" card).
  const intentShiftSummaryId = intent?.openShiftSummaryId ?? null;
  const shiftSubTab = intentBusinessDay
    ? 'business-day'
    : intentShiftSummaryId
      ? 'history'
      : selectedSubTab;
  const requestedBusinessDayDate = intentBusinessDay ?? selectedBusinessDayDate;
  const setShiftSubTab = (tab: 'today' | 'business-day' | 'history') => {
    clearNavIntent();
    setSelectedSubTab(tab);
  };
  /**
   * BusinessDayTab reports the requested date as consumed on mount. Commit the
   * durable half — that we are on the business-day sub-tab — into local state
   * first: clearing the intent alone would drop the tab derivation and bounce
   * the operator straight back to Active Shift.
   */
  const setRequestedBusinessDayDate = (date: string | null) => {
    setSelectedSubTab('business-day');
    setSelectedBusinessDayDate(date);
    clearNavIntent();
  };
  const [viewHistoryShiftId, setViewHistoryShiftId] = useState<string | null>(null);
  const requestedHistoryShiftId = intentShiftSummaryId ?? viewHistoryShiftId;
  /**
   * Mirror of `setRequestedBusinessDayDate`: commit the durable half (we are on
   * History) before clearing the intent, so dismissing the summary leaves the
   * operator in History rather than bouncing back to Active Shift.
   */
  const clearRequestedHistoryShiftId = () => {
    setSelectedSubTab('history');
    setViewHistoryShiftId(null);
    clearNavIntent();
  };

  // Open Shift Form States
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [businessDate, setBusinessDate] = useState(currentBusinessDate);
  const [openingCash, setOpeningCash] = useState(0);
  const [preserveNextShiftDate, setPreserveNextShiftDate] = useState(false);
  const [staffAssignments, setStaffAssignments] = useState<{ userId: string; duId: string }[]>([]);
  // Terminal→DU assignment for the shift being opened. duId '' means shift-wide (any DU).
  const [terminalAssignments, setTerminalAssignments] = useState<
    { terminalId: string; duId: string }[]
  >([]);
  const [initialReadings, setInitialReadings] = useState<
    { nozzleId: string; openingReading: number }[]
  >([]);
  const [isOpening, setIsOpening] = useState(false);
  // Active Shift Workspace States
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});

  // Close Flow Inline States
  const [isPreparingClose, setIsPreparingClose] = useState(false);
  const [closeWizardOpen, setCloseWizardOpen] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [confirmWarningsChecked, setConfirmWarningsChecked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const inventoryStatusQ = useInventoryStatus(stationId);
  const stationTanks = inventoryStatusQ.data ?? [];
  const [dipReadings, setDipReadings] = useState<Record<string, number | string>>({});
  const [dipReasons, setDipReasons] = useState<Record<string, string>>({});
  const [initialPendingWorkflow] = useState(() =>
    stationId ? loadPendingTankDipWorkflow(stationId) : null,
  );
  const [closedShiftSuccess, setClosedShiftSuccess] = useState<PendingTankDipWorkflow | null>(
    initialPendingWorkflow?.closeStatus === 'submitting' ? null : initialPendingWorkflow,
  );
  const [tankDipDraftShiftId, setTankDipDraftShiftId] = useState<string | null>(null);
  const [uncertainCloseWorkflow, setUncertainCloseWorkflow] =
    useState<PendingTankDipWorkflow | null>(
      initialPendingWorkflow?.closeStatus === 'submitting' ? initialPendingWorkflow : null,
    );

  const saveTankDips = useCallback(
    async (workflow?: PendingTankDipWorkflow | null) => {
      const target = workflow ?? closedShiftSuccess;
      if (!target || !stationId) return;
      await applyPendingTankDips({
        stationId,
        workflow: target,
        recordStockCount: (payload, options) =>
          transactionService.recordStockCount(payload, options),
        onWorkflowChange: setClosedShiftSuccess,
      });
      await invalidateOperational(stationId);
    },
    [closedShiftSuccess, invalidateOperational, stationId],
  );

  // Synchronize station-specific state before children render. React permits
  // guarded state adjustment during render and restarts with the new state.
  const [lastStationId, setLastStationId] = useState(selectedStation?.id);
  const [lastCurrentBusinessDate, setLastCurrentBusinessDate] = useState(currentBusinessDate);
  if (selectedStation?.id !== lastStationId) {
    const stored = stationId ? loadPendingTankDipWorkflow(stationId) : null;
    setLastStationId(selectedStation?.id);
    setLastCurrentBusinessDate(currentBusinessDate);
    setPreserveNextShiftDate(false);
    setBusinessDate(currentBusinessDate);
    setUncertainCloseWorkflow(stored?.closeStatus === 'submitting' ? stored : null);
    setClosedShiftSuccess(stored?.closeStatus === 'submitting' ? null : stored);
  } else if (currentBusinessDate !== lastCurrentBusinessDate) {
    setLastCurrentBusinessDate(currentBusinessDate);
    if (!data?.activeShift && !preserveNextShiftDate) setBusinessDate(currentBusinessDate);
  }

  useEffect(() => {
    if (!stationId || !statusQ.data || !uncertainCloseWorkflow) return;
    if (statusQ.data.activeShift?.id === uncertainCloseWorkflow.lastClosedShiftId) {
      return;
    }
    const confirmed = { ...uncertainCloseWorkflow, closeStatus: 'closed' as const };
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setUncertainCloseWorkflow(null);
      savePendingTankDipWorkflow(stationId, confirmed);
      setClosedShiftSuccess(confirmed);
      void saveTankDips(confirmed);
    });
    return () => {
      cancelled = true;
    };
  }, [saveTankDips, stationId, statusQ.data, uncertainCloseWorkflow]);

  useEffect(() => {
    if (stationId && closedShiftSuccess) {
      savePendingTankDipWorkflow(stationId, closedShiftSuccess);
    }
  }, [stationId, closedShiftSuccess]);

  // Handover Drawer states
  const [handoverDrawerOpen, setHandoverDrawerOpen] = useState(false);
  const [selectedHandoverAssignment, setSelectedHandoverAssignment] = useState<any>(null);
  const [handoverCreditCustomers, setHandoverCreditCustomers] = useState<any[]>([]);

  const handleOpenHandoverDrawer = async (assignment: any) => {
    setSelectedHandoverAssignment(assignment);
    setHandoverDrawerOpen(true);
    // Refresh the vehicle/customer caches so newly-added records (created in
    // another tab/session) are pickable in the Customer Sales section.
    await qc.invalidateQueries({ queryKey: ['vehicles'] });
    // Load customers pickable for on-account (Customer Sales) billing: all
    // customers except legacy station-prepaid non-fleet wallets. Prepaid Fleet
    // customers ARE included — they're OMC fleet cards (settled to CMS).
    try {
      const custList = await qc.fetchQuery({
        queryKey: queryKeys.customers(true),
        queryFn: () => transactionService.getCustomers(true),
        staleTime: 0,
      });
      setHandoverCreditCustomers(
        (custList || []).filter((c: any) => c.customerType === 'Fleet' || !c.isPrepaid),
      );
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

  const totalCashHandedOver = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.cashHandedOver || 0),
    0,
  );
  const totalCardHandedOver = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.cardHandedOver || 0),
    0,
  );
  const totalUpiHandedOver = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.upiHandedOver || 0),
    0,
  );
  const totalCreditHandedOver = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.creditHandedOver || 0),
    0,
  );
  // Net attendant accountability variance (declared − meter-expected), summed
  // across handovers. Positive = surplus, negative = shortage.
  const totalAttendantVariance = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.varianceAmount || 0),
    0,
  );

  const activeCashCollections = hasHandovers ? totalCashHandedOver : shiftTotals.cashCollections;
  const activeCardCollections = hasHandovers ? totalCardHandedOver : shiftTotals.cardCollections;
  const activeUpiCollections = hasHandovers ? totalUpiHandedOver : shiftTotals.upiCollections;
  const activeCreditSales = hasHandovers ? totalCreditHandedOver : shiftTotals.creditSales;

  // Authoritative cash reconciliation from the server (same figures CloseShift
  // uses). Preferred over the client estimate so the expected drawer includes
  // non-attendant merchandise cash and reads the true station-level short/surplus.
  const recon = data?.activeShift?.reconciliation;
  const expectedCash = recon
    ? openingCashNum +
      Number(recon.cashSales || 0) +
      Number(recon.cashCollections || 0) +
      Number(recon.cashIncome || 0) -
      Number(recon.drawerExpenses || 0) -
      Number(recon.drawerSupplierPayments || 0)
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
        cashIncome: Number(recon.cashIncome || 0),
        drawerExpenses: Number(recon.drawerExpenses || 0),
        drawerSupplierPayments: Number(recon.drawerSupplierPayments || 0),
        expectedDrawer: expectedCash,
        merchCashBreakdown: Array.isArray(recon.merchCashOutsideHandoverBreakdown)
          ? recon.merchCashOutsideHandoverBreakdown
          : [],
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
        warnings.push(
          `High volume alert: Nozzle ${nr.nozzleName} sold ${volume.toFixed(2)} ${nr.unit || 'L'}.`,
        );
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
        warnings.push(
          `Handover not recorded for attendant ${sa.userName} on dispenser ${sa.duName || 'DU'}.`,
        );
      }
    }

    // Mismatch check for credit chits vs customer bills
    const detailedCreditSum = shiftTotals.creditSales;
    if (hasHandovers && Math.abs(detailedCreditSum - totalCreditHandedOver) > 1.0) {
      warnings.push(
        `Credit Sales mismatch: Attendants declared ${inr(totalCreditHandedOver)} in chits, but only ${inr(detailedCreditSum)} of detailed customer billing has been logged in the transaction panel.`,
      );
    }

    if (closingCash === 0 && expectedCash > 0) {
      warnings.push('Closing cash is ₹0, indicating no collections entered.');
    }
    if (Math.abs(cashVariance) > 100) {
      warnings.push(
        `Cash discrepancy detected! Variance is ${inr(cashVariance)} (Expected: ${inr(expectedCash)}, Entered: ${inr(closingCash)})`,
      );
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
    {
      key: 'merchandise-sale',
      label: 'Merchandise Sale',
      onClick: triggerMerchandiseSaleDrawer,
      hotkey: 'M',
    },
    { key: 'purchase', label: 'Add Purchase', onClick: triggerPurchaseDrawer, hotkey: 'P' },
  ];

  // The shortcut triggers are re-created every render, so the listener reads
  // them through a ref. Adding them to the dependency list would instead tear
  // down and re-register the window listener on every render.
  const shortcutActionsRef = useRef({
    triggerExpenseDrawer,
    triggerCollectionDrawer,
    triggerMerchandiseSaleDrawer,
    triggerPurchaseDrawer,
  });
  useEffect(() => {
    shortcutActionsRef.current = {
      triggerExpenseDrawer,
      triggerCollectionDrawer,
      triggerMerchandiseSaleDrawer,
      triggerPurchaseDrawer,
    };
  });

  // Keyboard shortcuts (E/C/V/P) — active only on Today tab with an open shift and no other overlay focused.
  useEffect(() => {
    if (!data?.activeShift?.id) return;
    if (shiftSubTab !== 'today') return;
    if (viewingShiftSummary || requestedHistoryShiftId) return;
    if (closeWizardOpen || qe.open || handoverDrawerOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable)
          return;
      }
      const k = e.key.toLowerCase();
      if (k === 'e') {
        e.preventDefault();
        shortcutActionsRef.current.triggerExpenseDrawer();
      } else if (k === 'c') {
        e.preventDefault();
        shortcutActionsRef.current.triggerCollectionDrawer();
      } else if (k === 'm') {
        e.preventDefault();
        shortcutActionsRef.current.triggerMerchandiseSaleDrawer();
      } else if (k === 'p') {
        e.preventDefault();
        shortcutActionsRef.current.triggerPurchaseDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    data?.activeShift?.id,
    shiftSubTab,
    viewingShiftSummary,
    requestedHistoryShiftId,
    closeWizardOpen,
    qe.open,
    handoverDrawerOpen,
  ]);

  // Initialise form state before children render whenever cached status changes.
  const [initializedStatusData, setInitializedStatusData] = useState<typeof statusQ.data>(null);
  const statusData = statusQ.data;
  if (statusData && selectedStation && statusData !== initializedStatusData) {
    setInitializedStatusData(statusData);

    if (statusData.activeShift?.businessDate) {
      setBusinessDate(statusData.activeShift.businessDate);
      setPreserveNextShiftDate(false);
    }

    if (statusData.templates && statusData.templates.length > 0) {
      setSelectedTemplateId((prev: string) => prev || statusData.templates[0].id);
    }
    if (statusData.dispensers) {
      setStaffAssignments(
        statusData.dispensers.map((du: any) => ({
          duId: du.id,
          userId: statusData.staff?.[0]?.id ?? '',
        })),
      );
    }
    if (statusData.terminals) {
      setTerminalAssignments(
        statusData.terminals.map((t: any) => ({ terminalId: t.id, duId: '' })),
      );
    }
    if (statusData.nozzles) {
      setInitialReadings(
        statusData.nozzles.map((nz: any) => ({
          nozzleId: nz.id,
          openingReading: Number(nz.currentReading),
        })),
      );
      if (statusData.activeShift && statusData.activeShift.nozzleReadings) {
        const readingsMap: Record<string, number> = {};
        statusData.activeShift.nozzleReadings.forEach((nr: any) => {
          readingsMap[nr.nozzleId] = Number(nr.closingReading);
        });
        setClosingReadings(readingsMap);
        if (shouldResetTankDipDraft(tankDipDraftShiftId, statusData.activeShift.id)) {
          setDipReadings({});
          setDipReasons({});
        }
        setTankDipDraftShiftId(statusData.activeShift.id);
      } else {
        setTankDipDraftShiftId(null);
      }
    }
  }

  // Keep broad operational invalidation, then wait for the active full status
  // query so lifecycle transitions cannot render its stale active Shift.
  const loadShiftStatus = () => refreshShiftStatus(qc, invalidateOperational, stationId);

  const handleOpenShift = async (values: OpenShiftFormValues) => {
    if (!selectedStation) return;
    try {
      setIsOpening(true);
      setBusinessDate(values.businessDate);
      setSelectedTemplateId(values.shiftTemplateId);
      setOpeningCash(Number(values.openingCash));
      const payload: any = {
        stationId: selectedStation.id,
        shiftTemplateId: values.shiftTemplateId,
        businessDate: values.businessDate,
        openingCash: Number(values.openingCash),
        staffAssignments: staffAssignments.filter((a) => a.userId !== ''),
        terminalLinks: terminalAssignments.map((t) => ({
          terminalId: t.terminalId,
          duId: t.duId || null,
        })),
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
    setStaffAssignments((prev) => prev.map((a) => (a.duId === duId ? { ...a, userId } : a)));
  };

  const handleTerminalAssignmentChange = (terminalId: string, duId: string) => {
    setTerminalAssignments((prev) =>
      prev.map((t) => (t.terminalId === terminalId ? { ...t, duId } : t)),
    );
  };

  const handleInitialReadingChange = (nozzleId: string, openingReading: number) => {
    setInitialReadings((prev) =>
      prev.map((r) => (r.nozzleId === nozzleId ? { ...r, openingReading } : r)),
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
        toast.error(
          `Closing reading for nozzle ${nr.nozzleName} (${closing}) cannot be less than opening reading (${opening})`,
        );
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

      const tankDips = Object.entries(dipReadings)
        .filter(
          ([_, actualQuantity]) =>
            actualQuantity !== undefined && actualQuantity !== null && actualQuantity !== '',
        )
        .map(([tankId, actualQuantity]) => ({
          tankId,
          tankName: stationTanks.find((tank) => tank.id === tankId)?.name ?? 'Tank',
          actualQuantity: Number(actualQuantity),
          reason: dipReasons[tankId]?.trim() || undefined,
          status: 'pending' as const,
          idempotencyKey: createStockCountIdempotencyKey(),
        }));

      // Calculate expected, actual, variance and nextTemplateId before closing
      const expected = expectedCash;
      const actual = closingCash;
      const variance = cashVariance;
      const closedId = data.activeShift.id;

      let nextTemplateId = '';
      if (data?.templates && data.templates.length > 0 && data?.activeShift) {
        const currentIdx = data.templates.findIndex(
          (t: any) => t.id === data.activeShift.shiftTemplateId,
        );
        if (currentIdx !== -1) {
          nextTemplateId = data.templates[(currentIdx + 1) % data.templates.length].id;
        } else {
          nextTemplateId = data.templates[0].id;
        }
      }

      const preparedWorkflow: PendingTankDipWorkflow = {
        expectedCash: expected,
        closingCash: actual,
        variance,
        lastClosedShiftId: closedId,
        nextTemplateId,
        businessDate: data.activeShift.businessDate,
        currentBusinessDate,
        scheduledStartTime: data.activeShift.scheduledStartTime,
        scheduledEndTime: data.activeShift.scheduledEndTime,
        openedAt: data.activeShift.openedAt,
        closedAt: new Date().toISOString(),
        timeZone: stationSettings.timezone,
        tankDips,
        closeStatus: 'submitting',
      };
      if (stationId && tankDips.length > 0) savePendingTankDipWorkflow(stationId, preparedWorkflow);

      const closeResult = await shiftService.closeShift(data.activeShift.id, {
        closingCash,
        nozzleReadings: readingsArray,
      });

      setIsPreparingClose(false);
      setCloseWizardOpen(false);

      const closedWorkflow: PendingTankDipWorkflow = {
        ...preparedWorkflow,
        closeStatus: 'closed',
        closedAt: closeResult.shift.closedAt,
      };
      savePendingTankDipWorkflow(stationId!, closedWorkflow);
      // The success card is rendered from the close response, which already
      // carries everything it shows. Cache invalidation/refetch runs in the
      // background so the operator is never made to wait on the slowest
      // operational query for feedback the server has already given us.
      setClosedShiftSuccess(closedWorkflow);
      runTask(loadShiftStatus(), 'Shift closed, but the screen could not be refreshed.');
      await saveTankDips(closedWorkflow).catch(() => undefined);
    } catch (err: any) {
      if (stationId && isAmbiguousMutationError(err)) {
        const status = await shiftService.getShiftStatus(stationId).catch(() => null);
        if (status && status.activeShift?.id !== data.activeShift.id) {
          const workflow = loadPendingTankDipWorkflow(stationId);
          if (workflow) {
            const confirmed = { ...workflow, closeStatus: 'closed' as const };
            savePendingTankDipWorkflow(stationId, confirmed);
            setClosedShiftSuccess(confirmed);
            await saveTankDips(confirmed).catch(() => undefined);
          }
        }
      } else if (stationId) {
        savePendingTankDipWorkflow(stationId, null);
      }
      toast.error(err.message || 'Failed to close shift');
    } finally {
      setIsClosing(false);
    }
  };

  const discardTankDips = async () => {
    const unsavedCount =
      closedShiftSuccess?.tankDips.filter((dip) => dip.status !== 'saved').length ?? 0;
    if (
      !(await confirm({
        title: 'Discard unrecorded Tank Dips?',
        message: `${unsavedCount} unrecorded Tank Dip ${unsavedCount === 1 ? 'value' : 'values'} will be discarded. Any Tank Dips already saved remain recorded for the Business Day.`,
        confirmLabel: 'Discard Unrecorded',
        danger: true,
      }))
    )
      return;
    setClosedShiftSuccess((current) => (current ? discardUnrecordedTankDips(current) : current));
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to manage operational shifts.
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Resolving shift workspace states..." />;
  }

  if (error) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: 'var(--state-danger-bg)',
          color: 'var(--state-danger-fg)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <strong>Error:</strong> {error.message || 'Failed to load shifts configuration'}
      </div>
    );
  }

  if (!data) {
    return <LoadingSpinner text="Resolving shift workspace states..." />;
  }

  const {
    activeShift,
    lastShift,
    lastShiftSummary,
    canReopenLastShift,
    gracePeriodExpiresAt,
    templates,
    nozzles,
    staff,
    dispensers,
    terminals,
  } = data;
  const shiftScreenState: 'idle' | 'active' | 'closing' = activeShift
    ? isPreparingClose
      ? 'closing'
      : 'active'
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
        ].filter((tab) => userRole !== 'Accountant' || tab.id !== 'today')}
      />
    </div>
  );

  // Sub-tab: Business Day (read-only day cockpit)
  if (shiftSubTab === 'business-day') {
    return (
      <div
        className="animate-fade-in"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {renderShiftSubTabs()}
        <BusinessDayTab
          selectedStation={selectedStation}
          userRole={userRole}
          activeBusinessDayId={activeShift?.businessDayId ?? null}
          requestedBusinessDate={requestedBusinessDayDate}
          onBusinessDateSelected={() => setRequestedBusinessDayDate(null)}
          onNavigate={onNavigate}
        />
      </div>
    );
  }

  // Sub-tab: History
  if (shiftSubTab === 'history') {
    return (
      <div
        className="animate-fade-in"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {renderShiftSubTabs()}
        <ShiftHistoryTab
          selectedStation={selectedStation}
          userRole={userRole}
          viewShiftId={requestedHistoryShiftId}
          onClearViewShiftId={clearRequestedHistoryShiftId}
        />
      </div>
    );
  }

  // Render Success Screen if set
  if (closedShiftSuccess) {
    return (
      <ShiftCloseSuccess
        result={closedShiftSuccess}
        tankDips={closedShiftSuccess.tankDips}
        onSaveTankDips={() => saveTankDips()}
        onDiscardTankDips={discardTankDips}
        onStartNext={() => {
          setOpeningCash(closedShiftSuccess.closingCash);
          setSelectedTemplateId(closedShiftSuccess.nextTemplateId);
          setBusinessDate(closedShiftSuccess.businessDate);
          setPreserveNextShiftDate(true);
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
          runTask(loadShiftStatus(), 'Shift reopened, but the screen could not be refreshed.');
        }}
        onBack={() => setViewingShiftSummary(false)}
      />
    );
  }

  // Render Active Shift Workspace
  if (shiftScreenState === 'active' || shiftScreenState === 'closing') {
    return (
      <div
        className="animate-fade-in"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          fontFamily: 'var(--font-sans)',
        }}
      >
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
          currentBusinessDate={currentBusinessDate}
          timeZone={stationSettings.timezone}
          onViewLastShiftSummary={
            lastShiftSummary
              ? () => {
                  setViewHistoryShiftId(lastShiftSummary.shiftId);
                  setShiftSubTab('history');
                }
              : undefined
          }
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
          businessDate={activeShift.businessDate}
          currentBusinessDate={currentBusinessDate}
          scheduledStartTime={activeShift.scheduledStartTime}
          scheduledEndTime={activeShift.scheduledEndTime}
          timeZone={stationSettings.timezone}
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
          dipReasons={dipReasons}
          onDipReasonsChange={setDipReasons}
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
              (nr: any) => nr.duId === selectedHandoverAssignment.duId,
            )}
            terminals={(activeShift.terminalLinks || []).filter(
              (t: any) => t.duId === selectedHandoverAssignment.duId || t.duId == null,
            )}
            stationHasConfiguredTerminals={(data?.terminals || []).length > 0}
            customers={handoverCreditCustomers}
            merchandiseCash={Number(
              (activeShift.staffAssignments || []).find(
                (sa: any) => sa.userId === selectedHandoverAssignment.userId,
              )?.attributed?.merchandiseCash ?? 0,
            )}
            merchandiseNonCash={(() => {
              const a = (activeShift.staffAssignments || []).find(
                (sa: any) => sa.userId === selectedHandoverAssignment.userId,
              )?.attributed;
              return Number(a?.merchandiseCard ?? 0) + Number(a?.merchandiseUpi ?? 0);
            })()}
            creditSales={
              (activeShift.staffAssignments || []).find(
                (sa: any) =>
                  sa.userId === selectedHandoverAssignment.userId &&
                  sa.duId === selectedHandoverAssignment.duId,
              )?.creditSales ||
              selectedHandoverAssignment.creditSales ||
              []
            }
            omcSales={
              (activeShift.staffAssignments || []).find(
                (sa: any) =>
                  sa.userId === selectedHandoverAssignment.userId &&
                  sa.duId === selectedHandoverAssignment.duId,
              )?.omcSales ||
              selectedHandoverAssignment.omcSales ||
              []
            }
            onCreditChanged={async () => {
              await loadShiftStatus();
            }}
            existingHandover={activeShift.handovers?.find(
              (h: any) =>
                h.userId === selectedHandoverAssignment.userId &&
                h.duId === selectedHandoverAssignment.duId,
            )}
            onSaveSuccess={() => {}}
          />
        )}
      </div>
    );
  }

  // Render Open Shift Form
  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {renderShiftSubTabs()}
      <OpenShiftForm
        lastShiftSummary={lastShiftSummary}
        lastShift={lastShift}
        stationId={selectedStation.id}
        templates={templates}
        dispensers={dispensers}
        staff={staff}
        nozzles={nozzles}
        terminals={terminals}
        terminalAssignments={terminalAssignments}
        onTerminalAssignmentChange={handleTerminalAssignmentChange}
        selectedTemplateId={selectedTemplateId}
        businessDate={businessDate}
        currentBusinessDate={currentBusinessDate}
        timeZone={stationSettings.timezone}
        openingCash={openingCash}
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
