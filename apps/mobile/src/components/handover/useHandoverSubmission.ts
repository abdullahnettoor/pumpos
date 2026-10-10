import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CloudTransactionService,
  createIdempotencyKey,
  handoverPayloadFingerprint,
  queryKeys,
  resolveHandoverRequestIdentity,
  useRecordHandoverMutation,
  type RecordHandoverPayload,
  type RecordHandoverResult,
} from '@pump/ui';
import { num, type AssignedDu, type CreditLine, type DuFormState, type MerchRow } from './model.js';

const txService = new CloudTransactionService();

type Channel = 'credit' | 'omc';

/** The operator-facing text of whatever the API client threw. */
const messageOf = (e: unknown, fallback: string): string =>
  (e as { message?: string } | null)?.message ?? fallback;

const ZERO_TERMINALS_MESSAGE =
  'No card/UPI takings entered for the assigned terminal(s). If that is correct, save again to confirm; otherwise enter the terminal amounts.';

/** DUs with a terminal assigned where every terminal's card and UPI is zero. */
export function dusWithZeroTerminalTakings(
  dus: AssignedDu[],
  forms: Record<string, DuFormState>,
): AssignedDu[] {
  return dus.filter((du) => {
    const form = forms[du.duId];
    if (!form || du.terminals.length === 0) return false;
    return du.terminals.every(
      (t) =>
        num(form.terminals[t.terminalId]?.card) === 0 &&
        num(form.terminals[t.terminalId]?.upi) === 0,
    );
  });
}

/** The Handover request for one DU, exactly as it is sent to the server. */
export function buildHandoverPayload(input: {
  shiftId: string;
  attendantId: string;
  du: AssignedDu;
  form: DuFormState;
  aggregateNonCashAllowed: boolean;
}): RecordHandoverPayload {
  const { du, form } = input;
  const nozzleReadings = du.nozzles.map((nz) => ({
    nozzleId: nz.nozzleId,
    closingReading: num(form.readings[nz.nozzleId]),
    testingVolume: num(form.testing[nz.nozzleId]),
  }));
  const terminalEntries = du.terminals
    .map((t) => ({
      terminalId: t.terminalId,
      cardAmount: num(form.terminals[t.terminalId]?.card),
      upiAmount: num(form.terminals[t.terminalId]?.upi),
      batchRef: form.terminals[t.terminalId]?.batch || null,
    }))
    .filter((e) => e.cardAmount > 0 || e.upiAmount > 0 || e.batchRef);
  return {
    shiftId: input.shiftId,
    userId: input.attendantId,
    duId: du.duId,
    cashHandedOver: num(form.cash),
    cashDrops: num(form.drops),
    ...(du.terminals.length === 0 && input.aggregateNonCashAllowed
      ? { cardHandedOver: num(form.aggregateCard), upiHandedOver: num(form.aggregateUpi) }
      : {}),
    terminalEntries: du.terminals.length > 0 ? terminalEntries : undefined,
    nozzleReadings,
  };
}

/**
 * The handover's side effects: recording and voiding credit / fuel-card slips,
 * and saving the merchandise closing and each DU's Handover. Owns the request
 * identity (idempotency keys + fingerprints) so a retry replays rather than
 * duplicates, and the credit/fuel-card slip lists, which the server writes as
 * they are added (they are not part of the Handover payload).
 */
export function useHandoverSubmission(input: {
  dus: AssignedDu[];
  forms: Record<string, DuFormState>;
  shiftId: string | undefined;
  attendantId: string | undefined;
  stationId: string | undefined;
  aggregateNonCashAllowed: boolean;
  merchRows: MerchRow[];
  merchNonCash: string;
  /** Validation errors block the save (see steps.ts). */
  hasErrors: boolean;
  /** Called after the server accepts a DU's Handover, to echo it into the form. */
  onHandoverAccepted: (du: AssignedDu, result: RecordHandoverResult) => void;
  /** Called once every DU's Handover is accepted by a save, with the server's results. */
  onRecorded?: (results: RecordHandoverResult[]) => void;
}) {
  const { dus, forms, shiftId, attendantId, stationId } = input;
  const qc = useQueryClient();
  const recordHandover = useRecordHandoverMutation();

  const [editedCreditByDu, setEditedCreditByDu] = useState<Record<string, CreditLine[]>>({});
  const [editedOmcByDu, setEditedOmcByDu] = useState<Record<string, CreditLine[]>>({});
  const [ccBusy, setCcBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Terminals assigned but zero card/UPI declared: require one explicit
  // confirmation so a forgotten POS sheet is caught at entry.
  const [zeroTerminalsConfirmed, setZeroTerminalsConfirmed] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptedByDu, setAcceptedByDu] = useState<Record<string, RecordHandoverResult>>({});
  const handoverRequestByDuRef = useRef<
    Record<string, { fingerprint: string; idempotencyKey: string }>
  >({});
  const acceptedFingerprintByDuRef = useRef<Record<string, string>>({});
  const merchandiseRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(
    null,
  );

  // A DU the attendant has touched is never re-seeded from the assignment, so
  // recording a slip (which refetches it) cannot clobber what they typed.
  const creditByDu = useMemo(() => {
    const out: Record<string, CreditLine[]> = {};
    for (const du of dus) out[du.duId] = editedCreditByDu[du.duId] ?? du.creditSales ?? [];
    return out;
  }, [dus, editedCreditByDu]);
  const omcByDu = useMemo(() => {
    const out: Record<string, CreditLine[]> = {};
    for (const du of dus) out[du.duId] = editedOmcByDu[du.duId] ?? du.omcSales ?? [];
    return out;
  }, [dus, editedOmcByDu]);

  const resetMerchandiseAcceptance = () => {
    setAcceptedByDu({});
    merchandiseRequestRef.current = null;
  };
  const resetAcceptedHandover = (duId: string) => {
    setAcceptedByDu((current) => {
      if (!current[duId]) return current;
      const next = { ...current };
      delete next[duId];
      return next;
    });
    delete handoverRequestByDuRef.current[duId];
    delete acceptedFingerprintByDuRef.current[duId];
  };
  /** Any change to a terminal amount invalidates an earlier "yes, zero is right". */
  const clearZeroTerminalsConfirmation = () => setZeroTerminalsConfirmed(false);

  const addCredit = async (
    duId: string,
    channel: Channel,
    line: Omit<CreditLine, 'id'>,
    idempotencyKey?: string,
  ) => {
    if (!shiftId) return;
    setError(null);
    setCcBusy(true);
    try {
      const entry = await txService.recordCollection(
        {
          shiftId,
          customerId: line.customerId || undefined,
          vehicleId: line.vehicleId,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount,
          paymentMethod: channel === 'omc' ? 'OMC' : 'Credit',
          attendantId: attendantId ?? null,
          duId,
          notes: line.notes ?? undefined,
        },
        { idempotencyKey },
      );
      const stamped = { ...line, id: entry?.id };
      resetAcceptedHandover(duId);
      if (channel === 'omc')
        setEditedOmcByDu((c) => ({ ...c, [duId]: [...(c[duId] ?? omcByDu[duId] ?? []), stamped] }));
      else
        setEditedCreditByDu((c) => ({
          ...c,
          [duId]: [...(c[duId] ?? creditByDu[duId] ?? []), stamped],
        }));
    } catch (e: unknown) {
      setError(messageOf(e, 'Failed to add sale'));
      throw e;
    } finally {
      setCcBusy(false);
    }
  };

  const removeCredit = async (duId: string, channel: Channel, id: string) => {
    setError(null);
    setCcBusy(true);
    try {
      if (channel === 'omc') {
        await txService.voidOmcCardSale(id);
        resetAcceptedHandover(duId);
        setEditedOmcByDu((c) => ({
          ...c,
          [duId]: (c[duId] ?? omcByDu[duId] ?? []).filter((l) => l.id !== id),
        }));
      } else {
        await txService.voidCreditSale(id);
        resetAcceptedHandover(duId);
        setEditedCreditByDu((c) => ({
          ...c,
          [duId]: (c[duId] ?? creditByDu[duId] ?? []).filter((l) => l.id !== id),
        }));
      }
    } catch (e: unknown) {
      setError(messageOf(e, 'Failed to remove sale'));
    } finally {
      setCcBusy(false);
    }
  };

  /** Merchandise is recorded first so each accepted Handover reads the same
   *  authoritative merchandise cash that the live preview includes. */
  const saveMerchandise = async (shift: string) => {
    const merchLines = input.merchRows
      .map((r) => ({ productId: r.productId, quantity: num(r.quantity) }))
      .filter((l) => l.productId && l.quantity > 0);
    if (!merchLines.length) return;
    const merchandisePayload = {
      attendantId,
      lines: merchLines,
      nonCashAmount: num(input.merchNonCash),
    };
    const fingerprint = JSON.stringify(merchandisePayload);
    if (merchandiseRequestRef.current?.fingerprint !== fingerprint) {
      merchandiseRequestRef.current = { fingerprint, idempotencyKey: createIdempotencyKey() };
    }
    await txService.recordMerchandiseHandover(shift, merchandisePayload, {
      idempotencyKey: merchandiseRequestRef.current.idempotencyKey,
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.merchandiseHandovers(shift) }),
      qc.invalidateQueries({ queryKey: queryKeys.merchandiseSales(shift) }),
      stationId
        ? qc.invalidateQueries({ queryKey: queryKeys.inventoryItems(stationId) })
        : Promise.resolve(),
    ]);
  };

  async function save() {
    if (!shiftId) return;
    if (input.hasErrors) {
      setError('Please fix the highlighted fields before saving.');
      return;
    }
    if (!zeroTerminalsConfirmed && dusWithZeroTerminalTakings(dus, forms).length > 0) {
      setZeroTerminalsConfirmed(true);
      setError(ZERO_TERMINALS_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveMerchandise(shiftId);

      const results: RecordHandoverResult[] = [];
      for (const du of dus) {
        const form = forms[du.duId];
        if (!form) continue;
        const payload = buildHandoverPayload({
          shiftId,
          attendantId: attendantId!,
          du,
          form,
          aggregateNonCashAllowed: input.aggregateNonCashAllowed,
        });
        const fingerprint = handoverPayloadFingerprint(payload);
        if (acceptedFingerprintByDuRef.current[du.duId] === fingerprint && acceptedByDu[du.duId]) {
          results.push(acceptedByDu[du.duId]);
          continue;
        }
        handoverRequestByDuRef.current[du.duId] = resolveHandoverRequestIdentity(
          handoverRequestByDuRef.current[du.duId],
          payload,
        );
        const result = await recordHandover.mutateAsync({
          stationId: stationId ?? '',
          payload,
          idempotencyKey: handoverRequestByDuRef.current[du.duId].idempotencyKey,
        });
        acceptedFingerprintByDuRef.current[du.duId] = fingerprint;
        delete handoverRequestByDuRef.current[du.duId];
        setAcceptedByDu((current) => ({ ...current, [du.duId]: result }));
        input.onHandoverAccepted(du, result);
        results.push(result);
      }

      setSavedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
      input.onRecorded?.(results);
    } catch (e: unknown) {
      setError(messageOf(e, 'Could not save handover'));
    } finally {
      setSaving(false);
    }
  }

  return {
    creditByDu,
    omcByDu,
    addCredit,
    removeCredit,
    ccBusy,
    saving,
    save,
    savedAt,
    error,
    acceptedByDu,
    resetAcceptedHandover,
    resetMerchandiseAcceptance,
    clearZeroTerminalsConfirmation,
  };
}
