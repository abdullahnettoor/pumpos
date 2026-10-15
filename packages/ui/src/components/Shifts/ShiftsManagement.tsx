import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useNavIntent, clearNavIntent } from '../../nav-intent/store.js';
import {
  ROUTES,
  parseShiftCloseRoute,
  shiftCloseRoute,
  type ShiftCloseStep,
} from '../../nav-intent/routes.js';
import type { RouteNavigate } from '../../nav-intent/useRoutePath.js';
import { useQueryClient } from '@tanstack/react-query';
import { formatShortDay, inr } from '../../utils/format.js';
import { CloudShiftService, CloudTransactionService } from '../../services/cloud.js';
import { ShiftSummaryView } from './ShiftSummaryView.js';
import { HandoverDrawer } from './HandoverDrawer.js';
import { ShiftHistoryTab } from './ShiftHistoryTab.js';
import { CloseShiftPage, type CloseStep } from './CloseShiftPage.js';
import { ShiftCloseSuccess } from './ShiftCloseSuccess.js';
import { BusinessDayTab } from './BusinessDayTab.js';
import { seedStaffAssignments } from './seedStaffAssignments.js';
import { buildOpenShiftAssignments } from './openShiftAssignments.js';
import { OpenShiftForm } from './OpenShiftForm.js';
import { LiveShiftView } from './LiveShiftView.js';
import { IdleShiftView } from './IdleShiftView.js';
import { ShiftsHeaderActions, type RecordAction } from './ShiftsHeaderActions.js';
import { dayFigures } from './businessDayModel.js';
import {
  nozzleGroups,
  type PreHandoverTotals,
  type StaffAssignmentInput,
} from './liveShiftModel.js';
import {
  EMPTY_CLOSE_DRAFT,
  closeDrawerRows,
  closeDrawerTotal,
  closeWarnings,
  hasCloseProgress,
  loadCloseDraft,
  loadClosedResult,
  readingErrors,
  saveCloseDraft,
  saveClosedResult,
  type CloseDraft,
} from './closeShiftModel.js';
import { PageFrame } from '../page-frame/index.js';
import {
  Button,
  DataSection,
  EmptyState,
  Skeleton,
  Tabs,
  tabPanelProps,
  type TabItem,
} from '../../pump-ds/index.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import {
  useShiftStatus,
  useShiftTransactions,
  useInventoryStatus,
  useInvalidateOperational,
  useDailyDssrPreview,
  queryKeys,
} from '../../query/hooks.js';
import {
  applyPendingTankDips,
  createStockCountIdempotencyKey,
  discardUnrecordedTankDips,
  isAmbiguousMutationError,
  loadPendingTankDipWorkflow,
  savePendingTankDipWorkflow,
  type PendingTankDipWorkflow,
} from '../../query/stockCountMutation.js';
import { openQuickEntry, useQuickEntry, type QuickEntryType } from '../../quick-entry/store.js';
import {
  Station,
  buildCloseCashSummary,
  canCloseShift,
  canOpenShift,
  parseDrawerKey,
} from '@pump/shared';
import type { CloseCashDrawer, ShiftStaffAssignment } from '@pump/shared';
import type { DrawerRow } from './DrawerReconciliationTable.js';
import type { OpenShiftFormValues } from '@pump/shared';
import { useStationBusinessDate } from '../../hooks/useStationBusinessDate.js';
import { refreshShiftStatus } from './refreshShiftStatus.js';
import { useNow } from './useNow.js';
import {
  officeSubmitKeys,
  sendKeyed,
  type SubmitKeySession,
} from '../../office-records/submitKeys.js';
import type { KeyedSave } from '../../office-records/useKeyedSave.js';

const shiftService = new CloudShiftService();
const TABS_ID = 'shifts';
const transactionService = new CloudTransactionService();

interface ShiftTotals {
  cashCollections: number;
  cashExpenses: number;
  cardCollections: number;
  upiCollections: number;
  creditSales: number;
  expenseCount: number;
}

/** Derive the live shift totals from a shift-transactions payload (pure). */
function computeShiftTotals(txs: any): ShiftTotals {
  const collections = txs?.collections ?? [];
  const expenses = txs?.expenses ?? [];
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
  };
}

interface ShiftsManagementProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  /**
   * Required, not optional (#244). Both shells pass it; making it mandatory
   * means a future host cannot quietly drop the Business Day tab's "See older"
   * affordance, which is the only route to a day beyond the recent window.
   */
  onNavigate: (path: string) => void;
  /**
   * The shell's current path. `/shifts/<id>/close` is the Close shift page
   * (#534). Omitted, the page keeps its own (no address of its own).
   */
  route?: string;
  /** Changes the path; `{ replace: true }` rewrites the entry (a step change). */
  onRouteChange?: RouteNavigate;
}

export const ShiftsManagement: React.FC<ShiftsManagementProps> = ({
  selectedStation,
  userRole,
  userName,
  onNavigate,
  route: shellRoute,
  onRouteChange,
}) => {
  // The page's address: the shell's when it passes one, else its own.
  const [ownRoute, setOwnRoute] = useState<string>(ROUTES.shifts);
  const route = shellRoute ?? ownRoute;
  const goRoute = useCallback<RouteNavigate>(
    (next, options) =>
      onRouteChange
        ? onRouteChange(next, options)
        : setOwnRoute((prev) => (typeof next === 'function' ? next(prev) : next)),
    [onRouteChange],
  );
  const closeRoute = parseShiftCloseRoute(route);
  const onCloseRoute = !!closeRoute;
  const now = useNow();
  const stationId = selectedStation?.id ?? null;
  const stationSettings = (selectedStation?.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const currentBusinessDate = useStationBusinessDate(
    stationSettings.timezone,
    stationSettings.business_day_starts_at,
  );
  const statusQ = useShiftStatus(stationId, { refetchOnWindowFocus: false });
  // Idle Live shift: today so far, from the Business Day's DSR (the Dashboard
  // and Business days read the same cached preview).
  const todayQ = useDailyDssrPreview(stationId, currentBusinessDate, {
    enabled:
      !!stationId && !!statusQ.data && !statusQ.data.activeShift && userRole !== 'Accountant',
  });
  const todayFigures = useMemo(() => dayFigures(todayQ.data?.snapshotData), [todayQ.data]);
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
  const intentOpenPastDays = intent?.openPastDays === true;
  const shiftSubTab =
    intentBusinessDay || intentOpenPastDays
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
   * the operator straight back to Live shift.
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
   * operator in History rather than bouncing back to Live shift.
   */
  const clearRequestedHistoryShiftId = () => {
    setSelectedSubTab('history');
    setViewHistoryShiftId(null);
    clearNavIntent();
  };

  // Open Shift Form States
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [businessDate, setBusinessDate] = useState(currentBusinessDate);
  const [preserveNextShiftDate, setPreserveNextShiftDate] = useState(false);
  const [staffAssignments, setStaffAssignments] = useState<
    { userId: string; duId: string; openingFloat: number }[]
  >([]);
  // Terminal→DU assignment for the shift being opened. duId '' means shift-wide (any DU).
  const [terminalAssignments, setTerminalAssignments] = useState<
    { terminalId: string; duId: string }[]
  >([]);
  const [initialReadings, setInitialReadings] = useState<
    { nozzleId: string; openingReading: number }[]
  >([]);
  const [isOpening, setIsOpening] = useState(false);
  // Idle Live shift: the open-shift form shows once the operator asks for it.
  const [openFormVisible, setOpenFormVisible] = useState(false);
  // One Idempotency-Key session for the open-shift form's lifetime: a retry
  // after a lost answer reuses the key even if the form was edited, so the
  // server refuses it as an edited retry rather than opening a second shift.
  const openShiftKeys = useRef<SubmitKeySession | null>(null);
  // Opened: the success is shown at once; the new shift renders when the
  // status refresh (background) lands.
  const [awaitingOpenedShift, setAwaitingOpenedShift] = useState(false);
  const showOpenForm = (visible: boolean) => {
    openShiftKeys.current = null;
    setOpenFormVisible(visible);
  };
  // Active Shift Workspace States
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});

  // Close shift page (#534). What the operator enters is a per-shift draft,
  // kept in the tab's session so a reload or an accidental Back keeps it.
  const activeShiftId: string | null = data?.activeShift?.id ?? null;
  const draftOwner = stationId && activeShiftId ? `${stationId}:${activeShiftId}` : null;
  const [draftState, setDraftState] = useState<{ owner: string | null; draft: CloseDraft }>({
    owner: null,
    draft: EMPTY_CLOSE_DRAFT,
  });
  if (draftState.owner !== draftOwner) {
    setDraftState({
      owner: draftOwner,
      draft:
        stationId && activeShiftId ? loadCloseDraft(stationId, activeShiftId) : EMPTY_CLOSE_DRAFT,
    });
  }
  const draft = draftState.owner === draftOwner ? draftState.draft : EMPTY_CLOSE_DRAFT;
  const updateDraft = useCallback(
    (patch: Partial<CloseDraft>) =>
      setDraftState((s) => ({ ...s, draft: { ...s.draft, ...patch } })),
    [],
  );
  useEffect(() => {
    if (stationId && activeShiftId && draftState.owner === draftOwner) {
      saveCloseDraft(stationId, activeShiftId, draftState.draft);
    }
  }, [stationId, activeShiftId, draftOwner, draftState]);
  const closingCash = draft.closingCash;
  const closeDrops = draft.closeDrops;
  const dipReadings = draft.dipReadings;
  const dipReasons = draft.dipReasons;
  const [confirmWarningsChecked, setConfirmWarningsChecked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const inventoryStatusQ = useInventoryStatus(stationId);
  const stationTanks = inventoryStatusQ.data ?? [];
  const [initialPendingWorkflow] = useState(() =>
    stationId ? loadPendingTankDipWorkflow(stationId) : null,
  );
  const [closedShiftSuccess, setClosedShiftSuccess] = useState<PendingTankDipWorkflow | null>(
    initialPendingWorkflow?.closeStatus === 'submitting' ? null : initialPendingWorkflow,
  );
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
  const beforeHandovers = useMemo<PreHandoverTotals>(
    () => ({
      card: shiftTotals.cardCollections,
      upi: shiftTotals.upiCollections,
      credit: shiftTotals.creditSales,
    }),
    [shiftTotals],
  );

  const recon = data?.activeShift?.reconciliation;
  const handovers = data?.activeShift?.handovers || [];
  const hasHandovers = handovers.length > 0;

  const totalCashHandedOver = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.cashHandedOver || 0),
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

  // Close-shift cash summary (#307, ADR 0005): the server recon when loaded,
  // else Σ Opening Floats from the staff assignments. The two-level variance
  // (#287) uses the same shared formula CloseShift uses.
  const staffAssignmentRows: ShiftStaffAssignment[] = data?.activeShift?.staffAssignments ?? [];
  const reconDrawers: any[] = Array.isArray(recon?.drawers) ? recon.drawers : [];
  const closeDropEntries = closeDrops
    .filter((r) => r.amount > 0)
    .map((r) => ({ ...parseDrawerKey(r.drawerKey), amount: r.amount }));
  const { lines: cashLines, closeCash } = buildCloseCashSummary<CloseCashDrawer & DrawerRow>({
    recon,
    staffAssignments: staffAssignmentRows,
    closeDrops: closeDropEntries,
    closingCash,
    cashHandedOver: hasHandovers ? totalCashHandedOver : null,
  });
  const expectedCash = cashLines.expectedOfficeCash;
  const cashVariance = closingCash - expectedCash;

  // Station-level cash summary for the closing wizard (#4). Aggregate figures —
  // cross-attendant settlements (e.g. a borrowed POS) net out in the drawer total.
  const cashSummary =
    recon && closeCash
      ? {
          merchCashOutsideHandover: Number(recon.merchCashOutsideHandover || 0),
          drawers: closeCash.drawers,
          merchCashBreakdown: Array.isArray(recon.merchCashOutsideHandoverBreakdown)
            ? recon.merchCashOutsideHandoverBreakdown
            : [],
          attendantVariance: reconDrawers.length
            ? closeCash.attendantVariance
            : totalAttendantVariance,
          attendantVariances: reconDrawers.length
            ? closeCash.drawers
                .filter((d: any) => d.variance !== null)
                .map((d: any) => ({
                  name: d.attendantName || 'Attendant',
                  du: d.duName || null,
                  variance: Number(d.variance || 0),
                }))
            : handovers.map((h: any) => ({
                name: h.attendantName || h.userName || 'Attendant',
                du: h.duName || null,
                variance: Number(h.varianceAmount || 0),
              })),
          hasHandovers,
        }
      : null;

  // The close page's review: the old wizard's warnings, in its words.
  const onClosePage = !!closeRoute && !!data?.activeShift && closeRoute.shiftId === activeShiftId;
  // The step in the address is the draft's step, so Continue close resumes it.
  const routeStep = onClosePage && closeRoute.step !== 'done' ? closeRoute.step : null;
  if (routeStep && routeStep !== draft.step) updateDraft({ step: routeStep });
  const warnings: string[] = onClosePage
    ? closeWarnings({
        readings: data.activeShift.nozzleReadings,
        closing: closingReadings,
        assignments: data.activeShift.staffAssignments || [],
        handovers,
        creditSales: shiftTotals.creditSales,
        closingCash,
        expectedCash,
        formatMoney: inr,
      })
    : [];

  // Quick entry opens the global QuickEntryHost.
  const launchQuickEntry = (type: QuickEntryType) => {
    // Office Records opened here are still office records: the drawer says so
    // ("not part of <shift>") rather than taking the shift's name as its title.
    openQuickEntry(type, {
      origin: 'shifts',
      shiftName: data?.activeShift?.templateName ?? null,
    });
  };

  const triggerExpenseDrawer = () => launchQuickEntry('expense');
  const triggerCollectionDrawer = () => launchQuickEntry('collection');
  const triggerPurchaseDrawer = () => launchQuickEntry('purchase');
  const triggerMerchandiseSaleDrawer = () => launchQuickEntry('merchandise-sale');

  // Record ▾ (#533): a Product sale (a Billed Sale) while a shift is open, then
  // the Office Records. Same launchers and hotkeys as the old shift bar.
  const productSaleAction: RecordAction = {
    key: 'merchandise-sale',
    label: 'Product sale',
    hotkey: 'M',
    onSelect: triggerMerchandiseSaleDrawer,
  };
  const officeRecordActions: RecordAction[] = [
    { key: 'expense', label: 'Expense', hotkey: 'E', onSelect: triggerExpenseDrawer },
    { key: 'collection', label: 'Collection', hotkey: 'C', onSelect: triggerCollectionDrawer },
    { key: 'purchase', label: 'Purchase', hotkey: 'P', onSelect: triggerPurchaseDrawer },
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
    if (onCloseRoute || qe.open || handoverDrawerOpen) return;

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
    onCloseRoute,
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
    setStaffAssignments(seedStaffAssignments(statusData.dispensers));
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
      const payload: any = {
        stationId: selectedStation.id,
        shiftTemplateId: values.shiftTemplateId,
        businessDate: values.businessDate,
        ...buildOpenShiftAssignments(staffAssignments, terminalAssignments),
      };

      // If no last shift exists, send the manual override initial readings
      if (!data.lastShift) {
        payload.initialReadings = initialReadings;
      }

      openShiftKeys.current ??= officeSubmitKeys.session(`shift:open:${selectedStation.id}`);
      await sendKeyed(openShiftKeys.current, payload, (key) =>
        shiftService.openShift(payload, { idempotencyKey: key }),
      );
      // The open is saved: report it now; the workspace refreshes in the
      // background (caching rule 6) and the new shift shows when it lands.
      showOpenForm(false);
      setAwaitingOpenedShift(true);
      toast.success('Shift opened.');
      runTask(
        loadShiftStatus().finally(() => setAwaitingOpenedShift(false)),
        'Shift opened, but the screen could not be refreshed.',
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to open shift');
    } finally {
      setIsOpening(false);
    }
  };

  const handleStaffAssignmentChange = (duId: string, userId: string) => {
    setStaffAssignments((prev) => prev.map((a) => (a.duId === duId ? { ...a, userId } : a)));
  };

  const handleOpeningFloatChange = (duId: string, openingFloat: number) => {
    setStaffAssignments((prev) => prev.map((a) => (a.duId === duId ? { ...a, openingFloat } : a)));
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

  /**
   * Close shift / Continue close: the old prepare-close check (no closing
   * reading below its opening), then the Close shift page at the step the
   * draft was left on.
   */
  const startClose = () => {
    setSelectedSubTab('today');
    clearNavIntent();
    const shift = data?.activeShift;
    if (!shift) return;
    const errors = readingErrors(shift.nozzleReadings, closingReadings);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    if (!hasCloseProgress(draft)) setConfirmWarningsChecked(false);
    goRoute(shiftCloseRoute(shift.id, draft.step));
  };

  const setCloseStep = (step: CloseStep) => {
    updateDraft({ step });
    if (activeShiftId) goRoute(shiftCloseRoute(activeShiftId, step), { replace: true });
  };

  const leaveClosePage = () => goRoute(ROUTES.shifts);

  const showCloseResult = (workflow: PendingTankDipWorkflow) => {
    setClosedShiftSuccess(workflow);
    if (stationId) saveClosedResult(stationId, workflow.lastClosedShiftId, workflow);
    goRoute(shiftCloseRoute(workflow.lastClosedShiftId, 'done'), { replace: true });
  };

  const handleCloseShift = async (save: KeyedSave) => {
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
        shiftName: data.activeShift.templateName ?? null,
        tankDips,
        closeStatus: 'submitting',
      };
      if (stationId && tankDips.length > 0) savePendingTankDipWorkflow(stationId, preparedWorkflow);

      // One Idempotency-Key per visit to the close page (#534): a retry after
      // a lost answer reuses it, so the server answers with the first close
      // (or refuses an edited retry) rather than closing twice.
      const payload = {
        closingCash,
        nozzleReadings: readingsArray,
        ...(closeDropEntries.length > 0 ? { closeCashDrops: closeDropEntries } : {}),
      };
      const closeResult = await save({ stationId, shiftId: closedId, payload }, (idempotencyKey) =>
        shiftService.closeShift(closedId, payload, { idempotencyKey }),
      );
      if (stationId) saveCloseDraft(stationId, closedId, null);

      const closedWorkflow: PendingTankDipWorkflow = {
        ...preparedWorkflow,
        closeStatus: 'closed',
        closedAt: closeResult.shift.closedAt,
      };
      savePendingTankDipWorkflow(stationId!, closedWorkflow);
      // The success state is rendered from the close response, which already
      // carries everything it shows. Cache invalidation/refetch runs in the
      // background so the operator is never made to wait on the slowest
      // operational query for feedback the server has already given us.
      showCloseResult(closedWorkflow);
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
            showCloseResult(confirmed);
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
      <p className="p-6 text-[13px] text-ink-muted">
        Please select a station to manage operational shifts.
      </p>
    );
  }

  // The status payload is untyped; LiveShiftView reads it through `LiveShift`.
  const activeShift = data?.activeShift ?? null;
  const lastShift = data?.lastShift ?? null;
  const lastShiftSummary = data?.lastShiftSummary ?? null;
  const shiftScreenState: 'idle' | 'active' | 'closing' = activeShift
    ? hasCloseProgress(draft) || draft.step !== 'readings'
      ? 'closing'
      : 'active'
    : 'idle';

  const viewLastShiftSummary = lastShiftSummary
    ? () => {
        setViewHistoryShiftId(lastShiftSummary.shiftId);
        setShiftSubTab('history');
      }
    : null;

  const openHandover = (assignment: StaffAssignmentInput) =>
    runTask(handleOpenHandoverDrawer(assignment), 'Could not open the handover.');

  const viewShiftSummary = (shiftId: string) => {
    setViewHistoryShiftId(shiftId);
    setShiftSubTab('history');
    goRoute(ROUTES.shifts);
  };
  const dismissCloseResult = (result: PendingTankDipWorkflow) => {
    if (stationId) saveClosedResult(stationId, result.lastClosedShiftId, null);
    setClosedShiftSuccess(null);
    setViewingShiftSummary(false);
  };

  const mayClose = canCloseShift(userRole);
  const handoverDrawer =
    activeShift && selectedHandoverAssignment ? (
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
        openingFloat={Number(
          (activeShift.staffAssignments || []).find(
            (sa: any) =>
              sa.userId === selectedHandoverAssignment.userId &&
              sa.duId === selectedHandoverAssignment.duId,
          )?.openingFloat ?? 0,
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
    ) : null;

  // ── Close shift page (#534): `/shifts/<id>/close` ──────────────────────────
  // A close outcome left on Live shift (a reload with tank dips still to save)
  // is the close page's final state, as the old screen replaced Live shift.
  const closePage =
    closeRoute ??
    (shiftSubTab === 'today' && closedShiftSuccess
      ? { shiftId: closedShiftSuccess.lastClosedShiftId, step: 'done' as const }
      : null);
  if (closePage) {
    const result =
      closedShiftSuccess?.lastClosedShiftId === closePage.shiftId
        ? closedShiftSuccess
        : closePage.step === 'done' && stationId
          ? loadClosedResult<PendingTankDipWorkflow>(stationId, closePage.shiftId)
          : null;
    if (result) {
      return (
        <ShiftCloseSuccess
          result={result}
          shiftName={result.shiftName}
          tankDips={result.tankDips}
          onSaveTankDips={() => saveTankDips(result)}
          onDiscardTankDips={discardTankDips}
          onStartNext={() => {
            setSelectedTemplateId(result.nextTemplateId);
            setBusinessDate(result.businessDate);
            setPreserveNextShiftDate(true);
            dismissCloseResult(result);
            setSelectedSubTab('today');
            showOpenForm(true);
            goRoute(ROUTES.shifts);
          }}
          onViewSummary={() => {
            dismissCloseResult(result);
            viewShiftSummary(result.lastClosedShiftId);
          }}
          onBack={() => {
            dismissCloseResult(result);
            leaveClosePage();
          }}
        />
      );
    }
    if (activeShift && activeShift.id === closePage.shiftId && mayClose) {
      const step: CloseStep = closePage.step === 'done' ? 'confirm' : closePage.step;
      const drawerRowsList = closeDrawerRows({
        drawers: cashSummary?.drawers ?? [],
        assignments: staffAssignmentRows,
        handovers,
      });
      return (
        <>
          <CloseShiftPage
            shift={activeShift}
            currentBusinessDate={currentBusinessDate}
            timeZone={stationSettings.timezone}
            step={step}
            onStepChange={setCloseStep}
            onBack={leaveClosePage}
            groups={nozzleGroups(activeShift, { now, timeZone: stationSettings.timezone })}
            readingErrors={readingErrors(activeShift.nozzleReadings, closingReadings)}
            tanks={stationTanks}
            drawerRows={drawerRowsList}
            drawerTotal={closeDrawerTotal(drawerRowsList)}
            onOpenHandover={openHandover}
            cashLines={cashLines}
            productCashOutside={cashSummary?.merchCashOutsideHandover ?? 0}
            productCashBreakdown={cashSummary?.merchCashBreakdown ?? []}
            dropDrawers={(cashSummary?.drawers ?? []).map((d) => ({
              attendantId: d.attendantId,
              duId: d.duId,
              label: [d.duName, d.attendantName ?? 'Attendant'].filter(Boolean).join(' · '),
            }))}
            canRecordDrops={!!cashSummary}
            draft={draft}
            onDraftChange={updateDraft}
            hasHandovers={hasHandovers}
            attendantVariance={cashSummary?.attendantVariance ?? totalAttendantVariance}
            warnings={warnings}
            confirmWarningsChecked={confirmWarningsChecked}
            onConfirmWarningsChange={setConfirmWarningsChecked}
            isClosing={isClosing}
            onConfirmClose={(save) => runTask(handleCloseShift(save), 'Could not close the shift.')}
          />
          {handoverDrawer}
        </>
      );
    }
    // Loading, or a shift that is not open (closed, another shift) or a role
    // that cannot close: say so, with the way back.
    return (
      <PageFrame
        route={ROUTES.shifts}
        title="Close shift"
        back={{ label: 'Live shift', href: `#${ROUTES.shifts}`, onClick: leaveClosePage }}
      >
        <DataSection
          title="shift status"
          query={statusQ}
          shape="cards"
          placeholderHeight={320}
          enabled
        >
          <EmptyState
            title={mayClose ? 'This shift is not open' : 'Your role cannot close shifts'}
            description={
              mayClose
                ? 'It may already be closed. Its Shift Summary is in History.'
                : 'An Owner, Manager or Staff member closes the shift.'
            }
            action={
              <div className="flex gap-2">
                {mayClose && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => viewShiftSummary(closePage.shiftId)}
                  >
                    View shift summary
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={leaveClosePage}>
                  Back to Live shift
                </Button>
              </div>
            }
          />
        </DataSection>
      </PageFrame>
    );
  }

  if (shiftSubTab === 'today' && viewingShiftSummary && lastShiftSummary) {
    return (
      <ShiftSummaryView
        shiftSummary={lastShiftSummary}
        userRole={userRole}
        canReopen={data?.canReopenLastShift}
        gracePeriodExpiresAt={data?.gracePeriodExpiresAt}
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

  const primary = activeShift
    ? mayClose
      ? {
          label: shiftScreenState === 'closing' ? 'Continue close' : 'Close shift',
          icon: 'lock' as const,
          onClick: startClose,
        }
      : null
    : data && canOpenShift(userRole) && !openFormVisible
      ? {
          label: 'Open shift',
          icon: 'play' as const,
          onClick: () => {
            setShiftSubTab('today');
            showOpenForm(true);
          },
        }
      : null;

  const tabs: TabItem[] = (
    [
      {
        id: 'today',
        label: 'Live shift',
        concept: 'live-shift',
        badge: activeShift ? 'shift-live' : undefined,
      },
      { id: 'business-day', label: 'Business days', concept: 'business-days' },
      { id: 'history', label: 'History', concept: 'history' },
    ] satisfies TabItem[]
  ).filter((tab) => userRole !== 'Accountant' || tab.id !== 'today');

  return (
    <>
      <PageFrame
        route={ROUTES.shifts}
        subtitle={`${selectedStation.name} · Business day ${formatShortDay(
          activeShift?.businessDate ?? currentBusinessDate,
        )}`}
        actions={
          <ShiftsHeaderActions
            productSale={activeShift ? productSaleAction : null}
            officeRecords={officeRecordActions}
            primary={primary}
            showHotkeys={shiftSubTab === 'today' && !!activeShift}
          />
        }
        tabs={
          <Tabs
            id={TABS_ID}
            aria-label="Shift views"
            className="no-print"
            activeId={shiftSubTab}
            onChange={(id) => setShiftSubTab(id as 'today' | 'business-day' | 'history')}
            tabs={tabs}
          />
        }
      >
        <div {...tabPanelProps(TABS_ID, shiftSubTab)}>
          {shiftSubTab === 'business-day' && (
            <BusinessDayTab
              selectedStation={selectedStation}
              userRole={userRole}
              activeBusinessDayId={activeShift?.businessDayId ?? null}
              requestedBusinessDate={requestedBusinessDayDate}
              onBusinessDateSelected={() => setRequestedBusinessDayDate(null)}
              openPastDaysRequested={intentOpenPastDays}
              onOpenPastDaysConsumed={() => {
                setSelectedSubTab('business-day');
                clearNavIntent();
              }}
              onNavigate={onNavigate}
            />
          )}
          {shiftSubTab === 'history' && (
            <ShiftHistoryTab
              selectedStation={selectedStation}
              userRole={userRole}
              viewShiftId={requestedHistoryShiftId}
              onClearViewShiftId={clearRequestedHistoryShiftId}
            />
          )}
          {shiftSubTab === 'today' && (
            <DataSection
              title="shift status"
              query={statusQ}
              shape="cards"
              placeholderHeight={420}
              enabled
            >
              {activeShift ? (
                <LiveShiftView
                  shift={activeShift}
                  stationId={stationId}
                  timeZone={stationSettings.timezone}
                  currentBusinessDate={currentBusinessDate}
                  cashDeclared={cashLines.cashDeclared}
                  before={beforeHandovers}
                  closing={shiftScreenState === 'closing'}
                  canClose={mayClose}
                  onOpenHandover={openHandover}
                  onStartClose={startClose}
                  onViewLastSummary={viewLastShiftSummary}
                />
              ) : awaitingOpenedShift ? (
                <Skeleton aria-label="Loading the new shift" height={420} />
              ) : openFormVisible && data ? (
                <section className="flex flex-col gap-3" aria-label="Open a shift">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[14px] font-semibold text-ink-strong">Open a shift</h2>
                    <Button variant="ghost" size="sm" onClick={() => showOpenForm(false)}>
                      Cancel
                    </Button>
                  </div>
                  <OpenShiftForm
                    lastShift={lastShift}
                    stationId={selectedStation.id}
                    templates={data.templates}
                    dispensers={data.dispensers}
                    staff={data.staff}
                    nozzles={data.nozzles}
                    terminals={data.terminals}
                    terminalAssignments={terminalAssignments}
                    onTerminalAssignmentChange={handleTerminalAssignmentChange}
                    selectedTemplateId={selectedTemplateId}
                    businessDate={businessDate}
                    currentBusinessDate={currentBusinessDate}
                    staffAssignments={staffAssignments}
                    onStaffAssignmentChange={handleStaffAssignmentChange}
                    onOpeningFloatChange={handleOpeningFloatChange}
                    initialReadings={initialReadings}
                    onInitialReadingChange={handleInitialReadingChange}
                    isOpening={isOpening}
                    onSubmit={handleOpenShift}
                  />
                </section>
              ) : (
                <IdleShiftView
                  dayQuery={todayQ}
                  day={todayFigures}
                  lastShift={lastShift}
                  lastShiftId={lastShiftSummary?.shiftId ?? lastShift?.id ?? null}
                  lastVariance={
                    lastShiftSummary?.snapshotData?.cashVariance != null
                      ? Number(lastShiftSummary.snapshotData.cashVariance)
                      : null
                  }
                  timeZone={stationSettings.timezone}
                  onViewLastSummary={viewLastShiftSummary}
                />
              )}
            </DataSection>
          )}
        </div>
      </PageFrame>

      {handoverDrawer}
    </>
  );
};
