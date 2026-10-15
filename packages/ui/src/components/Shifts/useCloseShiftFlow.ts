import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { buildCloseCashSummary, parseDrawerKey } from '@pump/shared';
import type { CloseCashDrawer, ShiftStaffAssignment } from '@pump/shared';
import { shiftCloseRoute, ROUTES, type ShiftCloseStep } from '../../nav-intent/routes.js';
import type { RouteNavigate } from '../../nav-intent/useRoutePath.js';
import type { KeyedSave } from '../../office-records/useKeyedSave.js';
import { CloudShiftService, CloudTransactionService } from '../../services/cloud.js';
import {
  applyPendingTankDips,
  createStockCountIdempotencyKey,
  discardUnrecordedTankDips,
  isAmbiguousMutationError,
  loadPendingTankDipWorkflow,
  savePendingTankDipWorkflow,
  type PendingTankDipWorkflow,
} from '../../query/stockCountMutation.js';
import { inr } from '../../utils/format.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import type { DrawerRow } from './DrawerReconciliationTable.js';
import {
  EMPTY_CLOSE_DRAFT,
  closeDrawerRows,
  closeDrawerTotal,
  closeOutcomeFigures,
  closeWarnings,
  hasCloseProgress,
  loadCloseDraft,
  loadClosedResult,
  nextTemplateAfter,
  outcomeStanding,
  parseCloseOutcome,
  pruneCloseDrafts,
  readingErrors,
  saveCloseDraft,
  saveClosedResult,
  type CloseDraft,
} from './closeShiftModel.js';

const shiftService = new CloudShiftService();

/** Forget a close outcome this tab kept: its session copy and its tank-dip workflow. */
function forgetOutcome(stationId: string | null, shiftId: string) {
  if (!stationId) return;
  saveClosedResult(stationId, shiftId, null);
  const pending = parseCloseOutcome(loadPendingTankDipWorkflow(stationId));
  if (pending?.lastClosedShiftId === shiftId) savePendingTankDipWorkflow(stationId, null);
}
const transactionService = new CloudTransactionService();

export type CloseStep = Exclude<ShiftCloseStep, 'done'>;

/** A close outcome, and when this tab learnt it (kept with the outcome, so a reload keeps it). */
interface HeldOutcome {
  outcome: PendingTankDipWorkflow;
  seenAt: number;
}

const holding = (outcome: PendingTankDipWorkflow): HeldOutcome => ({
  outcome,
  seenAt: outcome.seenAt ?? 0,
});

/** The outcome stamped with now: this tab has just learnt the shift closed. */
const learnt = (outcome: PendingTankDipWorkflow): PendingTankDipWorkflow => ({
  ...outcome,
  seenAt: Date.now(),
});

/** What the close page shows for an address `/shifts/<id>/close`. */
export type CloseView =
  | { kind: 'outcome'; outcome: PendingTankDipWorkflow }
  | { kind: 'close'; step: CloseStep }
  | { kind: 'wait' }
  | { kind: 'unavailable' };

export interface CloseShiftFlowInput {
  stationId: string | null;
  timeZone?: string;
  currentBusinessDate: string;
  /** The full shift-status query: the cloud's word on which shift is open. */
  statusQ: Pick<UseQueryResult<any>, 'data' | 'dataUpdatedAt'>;
  /** The close address, when the page is on it. */
  closeRoute: { shiftId: string; step: ShiftCloseStep } | null;
  goRoute: RouteNavigate;
  /** Σ customer credit sales billed in the transaction panel (the warnings read it). */
  creditSales: number;
  tanks: { id: string; name: string }[];
  /** Refresh the shift status after the close (background). */
  loadShiftStatus: () => Promise<unknown>;
  mayClose: boolean;
}

/**
 * The Close shift flow (#534), out of ShiftsManagement: the per-shift draft
 * and its storage, the cash summary and warnings the page reads, the keyed
 * close, the outcome and its tank dips, and the lifecycle rules that keep all
 * of it in step with the cloud:
 *
 * - once the status names the open shift, drafts kept for any other shift
 *   are dropped, so a close made elsewhere or a reopen starts clean;
 * - an outcome is shown only while the status does not contradict it: the
 *   shift open again, or another shift closed since, drops it (and its
 *   stored copy).
 */
export function useCloseShiftFlow(input: CloseShiftFlowInput) {
  const {
    stationId,
    timeZone,
    currentBusinessDate,
    statusQ,
    closeRoute,
    goRoute,
    creditSales,
    tanks,
    loadShiftStatus,
    mayClose,
  } = input;
  const toast = useToast();
  const confirm = useConfirm();
  const runTask = useRunTask();
  const data = statusQ.data ?? null;
  const activeShift = data?.activeShift ?? null;
  const activeShiftId: string | null = activeShift?.id ?? null;

  // ── The draft: per station and shift, kept in this tab's session ─────────
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
  // The cloud says which shift is open: drafts for any other are stale.
  const statusKnown = !!data;
  useEffect(() => {
    if (stationId && statusKnown) pruneCloseDrafts(stationId, activeShiftId);
  }, [stationId, statusKnown, activeShiftId]);

  const [confirmWarningsChecked, setConfirmWarningsChecked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ── The outcome (and the tank dips saved after close) ─────────────────────
  const readStored = (id: string | null) => {
    const stored = id ? parseCloseOutcome(loadPendingTankDipWorkflow(id)) : null;
    return {
      held: stored && stored.closeStatus !== 'submitting' ? holding(stored) : null,
      uncertain: stored?.closeStatus === 'submitting' ? stored : null,
    };
  };
  const [initial] = useState(() => readStored(stationId));
  const [held, setHeld] = useState<HeldOutcome | null>(initial.held);
  const [uncertain, setUncertain] = useState<PendingTankDipWorkflow | null>(initial.uncertain);
  const [lastStationId, setLastStationId] = useState(stationId);
  if (stationId !== lastStationId) {
    const next = readStored(stationId);
    setLastStationId(stationId);
    setHeld(next.held);
    setUncertain(next.uncertain);
  }
  const closedOutcome = held?.outcome ?? null;
  const setOutcome = useCallback(
    (update: (o: PendingTankDipWorkflow) => PendingTankDipWorkflow) =>
      setHeld((h) => (h ? { ...h, outcome: update(h.outcome) } : h)),
    [],
  );

  const saveTankDips = useCallback(
    async (workflow?: PendingTankDipWorkflow | null) => {
      const target = workflow ?? closedOutcome;
      if (!target || !stationId) return;
      await applyPendingTankDips({
        stationId,
        workflow: target,
        recordStockCount: (payload, options) =>
          transactionService.recordStockCount(payload, options),
        onWorkflowChange: (next) => setOutcome(() => next),
      });
      await loadShiftStatus();
    },
    [closedOutcome, loadShiftStatus, setOutcome, stationId],
  );

  // A close whose answer was lost before a reload: settled once the status shows it closed.
  useEffect(() => {
    if (!stationId || !data || !uncertain) return;
    if (data.activeShift?.id === uncertain.lastClosedShiftId) return;
    const confirmed = { ...uncertain, closeStatus: 'closed' as const };
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setUncertain(null);
      savePendingTankDipWorkflow(stationId, confirmed);
      setHeld(holding(learnt(confirmed)));
      void saveTankDips(confirmed);
    });
    return () => {
      cancelled = true;
    };
  }, [saveTankDips, stationId, data, uncertain]);

  useEffect(() => {
    if (stationId && closedOutcome) savePendingTankDipWorkflow(stationId, closedOutcome);
  }, [stationId, closedOutcome]);

  /** The outcome for a shift, if one is held or stored and the status does not contradict it. */
  const outcomeFor = (shiftId: string, step: ShiftCloseStep) => {
    const kept =
      held?.outcome.lastClosedShiftId === shiftId
        ? held
        : step === 'done' && stationId
          ? (() => {
              const stored = loadClosedResult(stationId, shiftId);
              return stored ? holding(stored) : null;
            })()
          : null;
    if (!kept) return null;
    return {
      outcome: kept.outcome,
      standing: outcomeStanding(shiftId, kept.seenAt, data, statusQ.dataUpdatedAt),
    };
  };

  // ── The figures the page reads ────────────────────────────────────────────
  const closingReadings = useMemo(() => {
    const map: Record<string, number> = {};
    for (const nr of activeShift?.nozzleReadings ?? []) {
      map[nr.nozzleId] = Number(nr.closingReading);
    }
    return map;
  }, [activeShift]);
  const recon = activeShift?.reconciliation;
  const handovers: any[] = activeShift?.handovers || [];
  const hasHandovers = handovers.length > 0;
  const totalCashHandedOver = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.cashHandedOver || 0),
    0,
  );
  // Net attendant accountability variance (declared − meter-expected), summed
  // across handovers. Positive = surplus, negative = shortage.
  const totalAttendantVariance = handovers.reduce(
    (sum: number, h: any) => sum + Number(h.varianceAmount || 0),
    0,
  );
  const staffAssignments: ShiftStaffAssignment[] = activeShift?.staffAssignments ?? [];
  const reconDrawers: unknown[] = Array.isArray(recon?.drawers) ? recon.drawers : [];
  const closeDropEntries = draft.closeDrops
    .filter((r) => r.amount > 0)
    .map((r) => ({ ...parseDrawerKey(r.drawerKey), amount: r.amount }));
  // Close-shift cash summary (#307, ADR 0005): the server recon when loaded,
  // else Σ Opening Floats from the staff assignments.
  const { lines: cashLines, closeCash } = buildCloseCashSummary<CloseCashDrawer & DrawerRow>({
    recon,
    staffAssignments,
    closeDrops: closeDropEntries,
    closingCash: draft.closingCash,
    cashHandedOver: hasHandovers ? totalCashHandedOver : null,
  });
  const expectedCash = cashLines.expectedOfficeCash;
  const drawers = recon && closeCash ? closeCash.drawers : [];
  const drawerRows = closeDrawerRows({ drawers, assignments: staffAssignments, handovers });
  const onClosePage = !!closeRoute && !!activeShift && closeRoute.shiftId === activeShiftId;
  const figures = {
    cashLines,
    hasHandovers,
    canRecordDrops: !!(recon && closeCash),
    productCashOutside: Number(recon?.merchCashOutsideHandover || 0),
    productCashBreakdown: Array.isArray(recon?.merchCashOutsideHandoverBreakdown)
      ? (recon.merchCashOutsideHandoverBreakdown as { sellerName: string; amount: number }[])
      : [],
    attendantVariance:
      recon && closeCash && reconDrawers.length
        ? closeCash.attendantVariance
        : totalAttendantVariance,
    drawerRows,
    drawerTotal: closeDrawerTotal(drawerRows),
    dropDrawers: drawers.map((d) => ({
      attendantId: d.attendantId,
      duId: d.duId,
      label: [d.duName, d.attendantName ?? 'Attendant'].filter(Boolean).join(' · '),
    })),
    readingErrors: activeShift ? readingErrors(activeShift.nozzleReadings, closingReadings) : [],
    // The close page's review: the old wizard's warnings, in its words.
    warnings: onClosePage
      ? closeWarnings({
          readings: activeShift.nozzleReadings,
          closing: closingReadings,
          assignments: staffAssignments,
          handovers,
          creditSales,
          closingCash: draft.closingCash,
          expectedCash,
          formatMoney: inr,
        })
      : [],
  };

  // The step in the address is the draft's step, so Continue close resumes it.
  const routeStep = onClosePage && closeRoute.step !== 'done' ? closeRoute.step : null;
  if (routeStep && routeStep !== draft.step) updateDraft({ step: routeStep });

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Close shift / Continue close: the old prepare-close check, then the page at the draft's step. */
  const startClose = () => {
    if (!activeShift) return;
    const errors = figures.readingErrors;
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    if (!hasCloseProgress(draft)) setConfirmWarningsChecked(false);
    goRoute(shiftCloseRoute(activeShift.id, draft.step));
  };

  const setStep = (step: CloseStep) => {
    updateDraft({ step });
    if (activeShiftId) goRoute(shiftCloseRoute(activeShiftId, step), { replace: true });
  };

  const showOutcome = (outcome: PendingTankDipWorkflow) => {
    const stamped = learnt(outcome);
    setHeld(holding(stamped));
    if (stationId) {
      saveClosedResult(stationId, stamped.lastClosedShiftId, stamped);
      savePendingTankDipWorkflow(stationId, stamped);
    }
    goRoute(shiftCloseRoute(stamped.lastClosedShiftId, 'done'), { replace: true });
  };

  const closeShift = async (save: KeyedSave) => {
    if (!activeShift) return;
    try {
      setIsClosing(true);
      const nozzleReadings = Object.entries(closingReadings).map(([nozzleId, closingReading]) => ({
        nozzleId,
        closingReading,
      }));
      const tankDips = Object.entries(draft.dipReadings)
        .filter(([, q]) => q !== undefined && q !== null && q !== '')
        .map(([tankId, q]) => ({
          tankId,
          tankName: tanks.find((tank) => tank.id === tankId)?.name ?? 'Tank',
          actualQuantity: Number(q),
          reason: draft.dipReasons[tankId]?.trim() || undefined,
          status: 'pending' as const,
          idempotencyKey: createStockCountIdempotencyKey(),
        }));
      const closedId: string = activeShift.id;
      const prepared: PendingTankDipWorkflow = {
        expectedCash,
        closingCash: draft.closingCash,
        variance: draft.closingCash - expectedCash,
        lastClosedShiftId: closedId,
        nextTemplateId: nextTemplateAfter(data?.templates ?? [], activeShift.shiftTemplateId),
        businessDate: activeShift.businessDate,
        currentBusinessDate,
        scheduledStartTime: activeShift.scheduledStartTime,
        scheduledEndTime: activeShift.scheduledEndTime,
        openedAt: activeShift.openedAt,
        closedAt: new Date().toISOString(),
        timeZone,
        shiftName: activeShift.templateName ?? null,
        tankDips,
        closeStatus: 'submitting',
      };
      if (stationId && tankDips.length > 0) savePendingTankDipWorkflow(stationId, prepared);

      // One Idempotency-Key per visit to the close page: a retry after a lost
      // answer reuses it, so the server answers with the first close (or
      // refuses an edited retry) rather than closing twice.
      const payload = {
        closingCash: draft.closingCash,
        nozzleReadings,
        ...(closeDropEntries.length > 0 ? { closeCashDrops: closeDropEntries } : {}),
      };
      const result = await save({ stationId, shiftId: closedId, payload }, (idempotencyKey) =>
        shiftService.closeShift(closedId, payload, { idempotencyKey }),
      );
      if (stationId) saveCloseDraft(stationId, closedId, null);
      // The closed state reads the server's snapshot where it returns one.
      const closed: PendingTankDipWorkflow = {
        ...prepared,
        ...closeOutcomeFigures(result?.snapshot, prepared),
        closeStatus: 'closed',
        closedAt: result?.shift?.closedAt ?? prepared.closedAt,
      };
      if (stationId) savePendingTankDipWorkflow(stationId, closed);
      // Shown from the close response at once; the refresh runs in the background.
      showOutcome(closed);
      runTask(loadShiftStatus(), 'Shift closed, but the screen could not be refreshed.');
      await saveTankDips(closed).catch(() => undefined);
    } catch (err: any) {
      if (stationId && isAmbiguousMutationError(err)) {
        const status = await shiftService.getShiftStatus(stationId).catch(() => null);
        if (status && status.activeShift?.id !== activeShift.id) {
          const workflow = parseCloseOutcome(loadPendingTankDipWorkflow(stationId));
          if (workflow) {
            const confirmed = { ...workflow, closeStatus: 'closed' as const };
            savePendingTankDipWorkflow(stationId, confirmed);
            showOutcome(confirmed);
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
    const unsaved = closedOutcome?.tankDips.filter((dip) => dip.status !== 'saved').length ?? 0;
    const ok = await confirm({
      title: 'Discard unrecorded tank dips?',
      message: `${unsaved} unrecorded tank dip ${unsaved === 1 ? 'value' : 'values'} will be discarded. Any tank dips already saved remain recorded for the business day.`,
      confirmLabel: 'Discard unrecorded',
      danger: true,
    });
    if (ok) setOutcome(discardUnrecordedTankDips);
  };

  /** The operator is done with the closed state (Back, Open next, View summary). */
  const dismissOutcome = (outcome: PendingTankDipWorkflow) => {
    if (stationId) saveClosedResult(stationId, outcome.lastClosedShiftId, null);
    setHeld(null);
  };

  /**
   * What the close page shows. An outcome left on Live shift (a reload with
   * tank dips still to save) is the close page's final state, as the old
   * screen replaced Live shift.
   */
  const viewFor = (page: { shiftId: string; step: ShiftCloseStep }): CloseView => {
    const found = outcomeFor(page.shiftId, page.step);
    if (found?.standing === 'show') return { kind: 'outcome', outcome: found.outcome };
    if (!data) return { kind: 'wait' };
    if (activeShift && activeShift.id === page.shiftId && mayClose) {
      return { kind: 'close', step: page.step === 'done' ? 'confirm' : page.step };
    }
    return { kind: 'unavailable' };
  };

  // An outcome the status contradicts (the shift open again, or another
  // closed since) goes, with its stored copies. Adjusted during render, as the
  // draft is: the next render no longer holds it.
  if (
    held &&
    outcomeStanding(held.outcome.lastClosedShiftId, held.seenAt, data, statusQ.dataUpdatedAt) ===
      'drop'
  ) {
    forgetOutcome(stationId, held.outcome.lastClosedShiftId);
    setHeld(null);
  }
  if (closeRoute?.step === 'done' && stationId && data) {
    const stored = loadClosedResult(stationId, closeRoute.shiftId);
    // The stored copy is judged by when it was learnt, as the held one is: a
    // status read before the close (the cache at reload) cannot drop it.
    if (
      stored &&
      outcomeStanding(stored.lastClosedShiftId, stored.seenAt ?? 0, data, statusQ.dataUpdatedAt) ===
        'drop'
    ) {
      forgetOutcome(stationId, stored.lastClosedShiftId);
    }
  }

  return {
    draft,
    updateDraft,
    /** The draft has progress: the header offers Continue close. */
    inProgress: hasCloseProgress(draft) || draft.step !== 'readings',
    figures,
    confirmWarningsChecked,
    setConfirmWarningsChecked,
    isClosing,
    /** A held outcome to show on Live shift (it moves there), if the status allows. */
    strayOutcome: held?.outcome ?? null,
    viewFor,
    startClose,
    setStep,
    leave: () => goRoute(ROUTES.shifts),
    closeShift,
    saveTankDips,
    discardTankDips,
    dismissOutcome,
  };
}
