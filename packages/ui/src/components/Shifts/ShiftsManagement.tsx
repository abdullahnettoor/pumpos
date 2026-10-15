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
import { CloseShiftPage } from './CloseShiftPage.js';
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
import { useCloseShiftFlow } from './useCloseShiftFlow.js';
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
import type { PendingTankDipWorkflow } from '../../query/stockCountMutation.js';
import { openQuickEntry, useQuickEntry, type QuickEntryType } from '../../quick-entry/store.js';
import { Station, canCloseShift, canOpenShift } from '@pump/shared';
import type { OpenShiftFormValues } from '@pump/shared';
import { useStationBusinessDate } from '../../hooks/useStationBusinessDate.js';
import { refreshShiftStatus } from './refreshShiftStatus.js';
import { shiftMoneyConfirming, useHandoverWrites } from './handoverWrites.js';
import { useNow } from './useNow.js';
import {
  officeSubmitKeys,
  sendKeyed,
  type SubmitKeySession,
} from '../../office-records/submitKeys.js';

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
  // Handover Drawer states
  const [handoverDrawerOpen, setHandoverDrawerOpen] = useState(false);
  const [selectedHandoverAssignment, setSelectedHandoverAssignment] = useState<any>(null);
  const handleOpenHandoverDrawer = async (assignment: any) => {
    setSelectedHandoverAssignment(assignment);
    setHandoverDrawerOpen(true);
    // Refresh the vehicle and customer caches so records added in another tab
    // or session are pickable in Customer sales; the drawer reads them through
    // their queries (a failure shows there, with Retry).
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.vehicles(true) }),
      qc.invalidateQueries({ queryKey: queryKeys.customers(true) }),
    ]);
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

  const inventoryStatusQ = useInventoryStatus(stationId);
  // Keep broad operational invalidation, then wait for the active full status
  // query so lifecycle transitions cannot render its stale active Shift.
  const loadShiftStatus = () => refreshShiftStatus(qc, invalidateOperational, stationId);
  const mayClose = canCloseShift(userRole);
  // The Close shift page (#534): draft, figures, the keyed close and its outcome.
  const flow = useCloseShiftFlow({
    stationId,
    timeZone: stationSettings.timezone,
    currentBusinessDate,
    statusQ,
    closeRoute,
    goRoute,
    creditSales: shiftTotals.creditSales,
    tanks: inventoryStatusQ.data ?? [],
    loadShiftStatus,
    mayClose,
  });

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
    }
  }

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

  // Handovers in flight or refused, and whether the shift's money is still
  // to be confirmed by the refresh (#606).
  const handoverWrites = useHandoverWrites(data?.activeShift?.id ?? null);
  const moneyConfirming = shiftMoneyConfirming(handoverWrites, stationId, statusQ);

  const startClose = () => {
    setSelectedSubTab('today');
    clearNavIntent();
    flow.startClose();
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
    ? flow.inProgress
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
    flow.dismissOutcome(result);
    setViewingShiftSummary(false);
  };

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
  // An outcome left on Live shift (a reload with tank dips still to save) is
  // the close page's final state, as the old screen replaced Live shift.
  const closePage =
    closeRoute ??
    (shiftSubTab === 'today' && flow.strayOutcome
      ? { shiftId: flow.strayOutcome.lastClosedShiftId, step: 'done' as const }
      : null);
  if (closePage) {
    const view = flow.viewFor(closePage);
    if (view.kind === 'outcome') {
      const result = view.outcome;
      return (
        <ShiftCloseSuccess
          result={result}
          shiftName={result.shiftName}
          tankDips={result.tankDips}
          onSaveTankDips={() => flow.saveTankDips(result)}
          onDiscardTankDips={flow.discardTankDips}
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
            flow.leave();
          }}
        />
      );
    }
    if (view.kind === 'close' && activeShift) {
      const f = flow.figures;
      return (
        <>
          <CloseShiftPage
            shift={activeShift}
            currentBusinessDate={currentBusinessDate}
            timeZone={stationSettings.timezone}
            step={view.step}
            onStepChange={flow.setStep}
            onBack={flow.leave}
            queries={[inventoryStatusQ, shiftTxQ]}
            groups={nozzleGroups(activeShift, { now, timeZone: stationSettings.timezone })}
            readingErrors={f.readingErrors}
            tanks={inventoryStatusQ.data ?? []}
            drawerRows={f.drawerRows}
            drawerTotal={f.drawerTotal}
            onOpenHandover={openHandover}
            cashLines={f.cashLines}
            productCashOutside={f.productCashOutside}
            productCashBreakdown={f.productCashBreakdown}
            dropDrawers={f.dropDrawers}
            canRecordDrops={f.canRecordDrops}
            draft={flow.draft}
            onDraftChange={flow.updateDraft}
            hasHandovers={f.hasHandovers}
            attendantVariance={f.attendantVariance}
            warnings={f.warnings}
            confirmWarningsChecked={flow.confirmWarningsChecked}
            onConfirmWarningsChange={flow.setConfirmWarningsChecked}
            isClosing={flow.isClosing}
            onConfirmClose={(save) => runTask(flow.closeShift(save), 'Could not close the shift.')}
            handoverWrites={handoverWrites}
            confirming={moneyConfirming}
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
        back={{ label: 'Live shift', href: `#${ROUTES.shifts}`, onClick: flow.leave }}
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
                <Button variant="primary" size="sm" onClick={flow.leave}>
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

  const historyTab = (
    <ShiftHistoryTab
      selectedStation={selectedStation}
      userRole={userRole}
      viewShiftId={requestedHistoryShiftId}
      onClearViewShiftId={clearRequestedHistoryShiftId}
      onOpenShift={setViewHistoryShiftId}
    />
  );
  // An open Shift Summary is a page of its own (#535), with its back link to
  // History, so it renders outside this page's frame and tabs.
  if (shiftSubTab === 'history' && requestedHistoryShiftId) return historyTab;

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
          {shiftSubTab === 'history' && historyTab}
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
                  cashDeclared={flow.figures.cashLines.cashDeclared}
                  before={beforeHandovers}
                  closing={shiftScreenState === 'closing'}
                  canClose={mayClose}
                  onOpenHandover={openHandover}
                  onStartClose={startClose}
                  onViewLastSummary={viewLastShiftSummary}
                  handoverWrites={handoverWrites}
                  confirming={moneyConfirming}
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
