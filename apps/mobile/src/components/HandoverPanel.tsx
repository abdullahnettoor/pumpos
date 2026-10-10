import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useMyAssignment,
  useProducts,
  useCustomers,
  useAllVehicles,
  useInventoryItems,
  useMerchandiseHandovers,
  CloudTransactionService,
  handoverPayloadFingerprint,
  createIdempotencyKey,
  resolveHandoverRequestIdentity,
  selectHandoverSummary,
  useRecordHandoverMutation,
  queryKeys,
  inr,
  type CashBreakdown,
  type RecordHandoverPayload,
  type RecordHandoverResult,
} from '@pump/ui';
import { CashCountSheet } from './CashCountSheet.js';
import { runTask } from '@pump/ui';
import { CustomerSaleForm } from './handover/CustomerSaleForm.js';
import { NumberField, TextField } from './handover/Fields.js';
import { CalculatorIcon } from './handover/icons.js';
import {
  blankZero,
  num,
  seedForm,
  type CreditLine,
  type DuFormState,
  type DuProduct,
} from './handover/model.js';
import { ProductsFields } from './handover/ProductsFields.js';
import { StepCard } from './handover/StepCard.js';
import {
  cashStep,
  collectHandoverErrors,
  creditStep,
  expectedCashFor,
  productsStep,
  readingsStep,
  terminalsStep,
  type StepId,
} from './handover/steps.js';
import { SummaryStrip, formatVariance, varianceTone } from './handover/SummaryStrip.js';

/**
 * Shared self-service handover UI — mirrors the desktop HandoverDrawer. Loads the
 * signed-in user's OWN active DU assignment and lets them record closing readings
 * (+ per-nozzle testing), per-terminal card/UPI for the DU's assigned POS,
 * fuel-on-credit lines, cash, and a merchandise closing. Used both by the
 * dedicated Attendant shell and by the "My handover" tab that appears for any
 * other role when they are assigned to a dispenser unit on an open shift.
 *
 * Presentation: five collapsible step cards per DU under a sticky
 * Expected · Declared · Variance strip, with one Save handover action (there is
 * no draft — a save is re-saveable until the Shift closes). Data, validation and
 * the submitted payload are unchanged; see ./handover for the pieces.
 */

const txService = new CloudTransactionService();

const STEP_TITLE: Record<StepId, string> = {
  readings: 'Closing readings',
  credit: 'Credit & fuel-card sales',
  terminals: 'Card / UPI',
  products: 'Products sold',
  cash: 'Cash handed over',
};

export const HandoverPanel: React.FC = () => {
  const assignmentQ = useMyAssignment();
  const productsQ = useProducts();
  const customersQ = useCustomers(true);
  const vehiclesQ = useAllVehicles(true);
  const qc = useQueryClient();
  const recordHandover = useRecordHandoverMutation();

  const data = assignmentQ.data;
  // Memoised: a bare `?? []` gives the seed effect below a new array identity
  // every render, which is what made its dependency list unsatisfiable.
  const dus: any[] = useMemo(() => data?.dispenserUnits ?? [], [data?.dispenserUnits]);
  const shiftId: string | undefined = data?.shift?.id;
  const attendantId: string | undefined = data?.userId;
  const stationId: string | undefined = data?.station?.id ?? data?.shift?.stationId;
  const aggregateNonCashAllowed = data?.stationHasConfiguredTerminals === false;
  const inventoryQ = useInventoryItems(stationId ?? null);
  const merchHandoversQ = useMerchandiseHandovers(shiftId ?? null);

  const [editedForms, setEditedForms] = useState<Record<string, DuFormState>>({});
  const [editedCreditByDu, setEditedCreditByDu] = useState<Record<string, CreditLine[]>>({});
  const [editedOmcByDu, setEditedOmcByDu] = useState<Record<string, CreditLine[]>>({});
  const [editedMerchRows, setEditedMerchRows] = useState<
    { productId: string; quantity: string }[] | null
  >(null);
  const [editedMerchNonCash, setEditedMerchNonCash] = useState<string | null>(null);
  const [ccBusy, setCcBusy] = useState(false);
  // Cash denomination counter (bottom sheet): which DU's sheet is open + per-DU
  // counts (parent-held so re-opening preserves them; future backend = drop-in).
  const [sheetDuId, setSheetDuId] = useState<string | null>(null);
  const [cashBreakdownByDu, setCashBreakdownByDu] = useState<Record<string, CashBreakdown>>({});
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
  const resetMerchandiseAcceptance = () => {
    setAcceptedByDu({});
    merchandiseRequestRef.current = null;
  };

  /**
   * The attendant's entry for each DU: what they have typed, falling back to
   * what the assignment says. Derived rather than copied in by an effect — the
   * effect needed an anti-clobber guard precisely because recording a credit
   * sale refetches the assignment mid-entry, and a fallback expresses that
   * directly: a DU the attendant has touched is simply never re-seeded.
   */

  const forms = useMemo(() => {
    const out: Record<string, DuFormState> = {};
    for (const du of dus) out[du.duId] = editedForms[du.duId] ?? seedForm(du);
    return out;
  }, [dus, editedForms]);

  const creditByDu = useMemo(() => {
    const out: Record<string, CreditLine[]> = {};
    for (const du of dus)
      out[du.duId] = editedCreditByDu[du.duId] ?? ((du.creditSales || []) as CreditLine[]);
    return out;
  }, [dus, editedCreditByDu]);

  const omcByDu = useMemo(() => {
    const out: Record<string, CreditLine[]> = {};
    for (const du of dus)
      out[du.duId] = editedOmcByDu[du.duId] ?? ((du.omcSales || []) as CreditLine[]);
    return out;
  }, [dus, editedOmcByDu]);

  // Merchandise products (non-fuel), for the add-line picker.
  const merchProducts = useMemo(
    () =>
      (productsQ.data || []).filter(
        (p: any) => p.productType && p.productType !== 'FUEL' && p.isActive !== false,
      ),
    [productsQ.data],
  );
  const merchById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of merchProducts) m[p.id] = p;
    return m;
  }, [merchProducts]);

  // On-hand stock per merchandise product (shown in the picker, like desktop).
  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    (inventoryQ.data || []).forEach((i: any) => {
      m[i.productId] = Number(i.quantity);
    });
    return m;
  }, [inventoryQ.data]);

  const merchOptions = useMemo(
    () =>
      merchProducts.map((pr: any) => {
        const onHand = stock[pr.id];
        const priceLabel =
          pr.sellingPrice != null ? `MRP ${inr(Number(pr.sellingPrice))}` : 'No price set';
        const stockLabel = onHand != null ? `${onHand} ${pr.unit || 'unit'} on hand` : null;
        return {
          value: pr.id,
          label: `${pr.name}${pr.brand ? ` · ${pr.brand}` : ''}`,
          sublabel: stockLabel ? `${priceLabel} · ${stockLabel}` : priceLabel,
        };
      }),
    [merchProducts, stock],
  );

  /**
   * The attendant's merchandise closing: what they have typed, else whatever
   * they already declared this shift. Derived rather than seeded by an effect —
   * the server replaces the whole handover on each save, so a prefill that
   * arrived a frame late could submit an empty list over a real one.
   */
  const myMerchandise = useMemo(
    () => (merchHandoversQ.data ?? []).find((h: any) => h.attendantId === attendantId),
    [merchHandoversQ.data, attendantId],
  );
  const merchRows = useMemo<{ productId: string; quantity: string }[]>(() => {
    if (editedMerchRows) return editedMerchRows;
    const items = myMerchandise?.items ?? [];
    return items.length
      ? items.map((it: any) => ({ productId: it.productId, quantity: String(Number(it.quantity)) }))
      : [{ productId: '', quantity: '' }];
  }, [editedMerchRows, myMerchandise]);
  const merchNonCash =
    editedMerchNonCash ??
    (myMerchandise?.nonCashAmount != null && Number(myMerchandise.nonCashAmount) > 0
      ? String(Number(myMerchandise.nonCashAmount))
      : '');

  // Customers pickable for on-account sales: all except legacy station-prepaid
  // non-fleet wallets. Prepaid Fleet ARE included (OMC fleet cards → CMS).
  const creditCustomers = useMemo(
    () => (customersQ.data || []).filter((c: any) => c.customerType === 'Fleet' || !c.isPrepaid),
    [customersQ.data],
  );
  // Cached vehicles (semi tier, persisted) — no server search.
  const allVehicles = useMemo(() => vehiclesQ.data ?? [], [vehiclesQ.data]);

  const duProductsFor = (du: any): DuProduct[] =>
    Array.from(
      new Map(
        (du.nozzles || [])
          .filter((n: any) => n.productId)
          .map((n: any) => [
            n.productId,
            {
              id: n.productId,
              name: n.productName ?? 'Fuel',
              unit: n.unit ?? 'L',
              price: Number(n.unitPrice || 0),
            },
          ]),
      ).values(),
    ) as DuProduct[];

  const clearAccepted = (duId: string) =>
    setAcceptedByDu((current) => {
      if (!current[duId]) return current;
      const next = { ...current };
      delete next[duId];
      return next;
    });
  const resetAcceptedHandover = (duId: string) => {
    clearAccepted(duId);
    delete handoverRequestByDuRef.current[duId];
    delete acceptedFingerprintByDuRef.current[duId];
  };
  const setReading = (duId: string, nozzleId: string, v: string) => {
    resetAcceptedHandover(duId);
    setEditedForms((f) => ({
      ...f,
      [duId]: {
        ...(f[duId] ?? forms[duId]),
        readings: { ...(f[duId] ?? forms[duId]).readings, [nozzleId]: v },
      },
    }));
  };
  const setTesting = (duId: string, nozzleId: string, v: string) => {
    resetAcceptedHandover(duId);
    setEditedForms((f) => ({
      ...f,
      [duId]: {
        ...(f[duId] ?? forms[duId]),
        testing: { ...(f[duId] ?? forms[duId]).testing, [nozzleId]: v },
      },
    }));
  };
  const setCash = (duId: string, v: string) => {
    resetAcceptedHandover(duId);
    setEditedForms((f) => ({ ...f, [duId]: { ...(f[duId] ?? forms[duId]), cash: v } }));
  };
  const setDrops = (duId: string, v: string) => {
    resetAcceptedHandover(duId);
    setEditedForms((f) => ({ ...f, [duId]: { ...(f[duId] ?? forms[duId]), drops: v } }));
  };
  const setAggregate = (duId: string, field: 'aggregateCard' | 'aggregateUpi', v: string) => {
    resetAcceptedHandover(duId);
    setEditedForms((f) => ({ ...f, [duId]: { ...(f[duId] ?? forms[duId]), [field]: v } }));
  };
  const setTerminal = (
    duId: string,
    terminalId: string,
    field: 'card' | 'upi' | 'batch',
    v: string,
  ) => {
    resetAcceptedHandover(duId);
    setEditedForms((f) => ({
      ...f,
      [duId]: {
        ...(f[duId] ?? forms[duId]),
        terminals: {
          ...(f[duId] ?? forms[duId]).terminals,
          [terminalId]: { ...(f[duId] ?? forms[duId]).terminals[terminalId], [field]: v },
        },
      },
    }));
  };

  const addCredit = async (
    duId: string,
    channel: 'credit' | 'omc',
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
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add sale');
      throw e;
    } finally {
      setCcBusy(false);
    }
  };

  const removeCredit = async (duId: string, channel: 'credit' | 'omc', id: string) => {
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
    } catch (e: any) {
      setError(e?.message ?? 'Failed to remove sale');
    } finally {
      setCcBusy(false);
    }
  };

  const collectErrors = () =>
    collectHandoverErrors({ dus, forms, aggregateNonCashAllowed, merchNonCash, merchRows });

  async function handleSave() {
    if (!shiftId) return;
    if (collectErrors().length > 0) {
      setError('Please fix the highlighted fields before saving.');
      return;
    }
    if (!zeroTerminalsConfirmed) {
      const zeroDus = (data?.dus ?? []).filter((du: any) => {
        const form = forms[du.duId];
        if (!form || du.terminals.length === 0) return false;
        return du.terminals.every(
          (t: any) =>
            num(form.terminals[t.terminalId]?.card) === 0 &&
            num(form.terminals[t.terminalId]?.upi) === 0,
        );
      });
      if (zeroDus.length > 0) {
        setZeroTerminalsConfirmed(true);
        setError(
          'No card/UPI takings entered for the assigned terminal(s). If that is correct, save again to confirm; otherwise enter the terminal amounts.',
        );
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      // Merchandise is recorded first so each accepted Handover reads the same
      // authoritative merchandise cash that the live preview includes.
      const merchLines = merchRows
        .map((r) => ({ productId: r.productId, quantity: num(r.quantity) }))
        .filter((l) => l.productId && l.quantity > 0);
      if (merchLines.length) {
        const merchandisePayload = {
          attendantId,
          lines: merchLines,
          nonCashAmount: num(merchNonCash),
        };
        const fingerprint = JSON.stringify(merchandisePayload);
        if (merchandiseRequestRef.current?.fingerprint !== fingerprint) {
          merchandiseRequestRef.current = { fingerprint, idempotencyKey: createIdempotencyKey() };
        }
        await txService.recordMerchandiseHandover(shiftId, merchandisePayload, {
          idempotencyKey: merchandiseRequestRef.current.idempotencyKey,
        });
        await Promise.all([
          qc.invalidateQueries({ queryKey: queryKeys.merchandiseHandovers(shiftId) }),
          qc.invalidateQueries({ queryKey: queryKeys.merchandiseSales(shiftId) }),
          stationId
            ? qc.invalidateQueries({ queryKey: queryKeys.inventoryItems(stationId) })
            : Promise.resolve(),
        ]);
      }

      for (const du of dus) {
        const form = forms[du.duId];
        if (!form) continue;
        const nozzleReadings = du.nozzles.map((nz: any) => ({
          nozzleId: nz.nozzleId,
          closingReading: num(form.readings[nz.nozzleId]),
          testingVolume: num(form.testing[nz.nozzleId]),
        }));
        const terminalEntries = du.terminals
          .map((t: any) => ({
            terminalId: t.terminalId,
            cardAmount: num(form.terminals[t.terminalId]?.card),
            upiAmount: num(form.terminals[t.terminalId]?.upi),
            batchRef: form.terminals[t.terminalId]?.batch || null,
          }))
          .filter((e: any) => e.cardAmount > 0 || e.upiAmount > 0 || e.batchRef);
        const payload: RecordHandoverPayload = {
          shiftId,
          userId: attendantId!,
          duId: du.duId,
          cashHandedOver: num(form.cash),
          cashDrops: num(form.drops),
          ...(du.terminals.length === 0 && aggregateNonCashAllowed
            ? { cardHandedOver: num(form.aggregateCard), upiHandedOver: num(form.aggregateUpi) }
            : {}),
          terminalEntries: du.terminals.length > 0 ? terminalEntries : undefined,
          nozzleReadings,
        };
        const fingerprint = handoverPayloadFingerprint(payload);
        if (acceptedFingerprintByDuRef.current[du.duId] === fingerprint && acceptedByDu[du.duId])
          continue;
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
        setEditedForms((current) => ({
          ...current,
          [du.duId]: {
            ...(current[du.duId] ?? forms[du.duId]),
            cash: blankZero(result.handover.cashHandedOver),
            drops: blankZero(result.handover.cashDrops),
            aggregateCard: blankZero(result.handover.cardHandedOver),
            aggregateUpi: blankZero(result.handover.upiHandedOver),
            readings: Object.fromEntries(
              result.nozzleReadings.map((reading) => [
                reading.nozzleId,
                String(reading.closingReading),
              ]),
            ),
            testing: Object.fromEntries(
              result.nozzleReadings.map((reading) => [
                reading.nozzleId,
                blankZero(reading.testingVolume),
              ]),
            ),
            terminals: Object.fromEntries(
              du.terminals.map((terminal: any) => {
                const entry = result.terminalEntries.find(
                  (item) => item.terminalId === terminal.terminalId,
                );
                return [
                  terminal.terminalId,
                  {
                    card: blankZero(entry?.cardAmount),
                    upi: blankZero(entry?.upiAmount),
                    batch: entry?.batchRef ?? '',
                  },
                ];
              }),
            ),
          },
        }));
      }

      setSavedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e: any) {
      setError(e?.message ?? 'Could not save handover');
    } finally {
      setSaving(false);
    }
  }

  if (assignmentQ.isLoading) {
    return <p className="py-10 text-center text-sm text-text-muted">Loading your shift…</p>;
  }

  if (!data) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line-strong p-8 text-center">
        <p className="text-4xl">⛽</p>
        <p className="mt-2 font-semibold text-text-high">No open shift assigned to you</p>
        <p className="mt-1 text-sm text-text-muted">
          Once a manager opens a shift and assigns you to a dispenser unit, it will appear here.
        </p>
      </div>
    );
  }

  // Aggregate reconciliation across all DUs + merchandise (matches desktop).
  let fuelExpected = 0;
  let declaredTotal = 0;
  let drawerAdjustment = 0;
  for (const du of dus) {
    const form = forms[du.duId];
    if (!form) continue;
    for (const nz of du.nozzles) {
      const vol = Math.max(0, num(form.readings[nz.nozzleId]) - nz.openingReading);
      const net = Math.max(0, vol - num(form.testing[nz.nozzleId]));
      fuelExpected += net * Number(nz.unitPrice || 0);
    }
    const cardTotal =
      du.terminals.length > 0
        ? du.terminals.reduce((s: number, t: any) => s + num(form.terminals[t.terminalId]?.card), 0)
        : aggregateNonCashAllowed
          ? num(form.aggregateCard)
          : 0;
    const upiTotal =
      du.terminals.length > 0
        ? du.terminals.reduce((s: number, t: any) => s + num(form.terminals[t.terminalId]?.upi), 0)
        : aggregateNonCashAllowed
          ? num(form.aggregateUpi)
          : 0;
    const creditTotal = (creditByDu[du.duId] || []).reduce((s, l) => s + Number(l.amount || 0), 0);
    const omcTotal = (omcByDu[du.duId] || []).reduce((s, l) => s + Number(l.amount || 0), 0);
    declaredTotal += num(form.cash) + cardTotal + upiTotal + creditTotal + omcTotal;
    // The pouch also holds the Opening Float and lacks what was dropped.
    drawerAdjustment += Number(du.openingFloat || 0) - num(form.drops);
  }
  const merchGross = merchRows.reduce(
    (s, r) => s + num(r.quantity) * Number(merchById[r.productId]?.sellingPrice || 0),
    0,
  );
  const merchCash = Math.max(0, merchGross - num(merchNonCash));
  const expectedTotal = fuelExpected + merchCash;
  const varianceTotal = Math.round((declaredTotal - expectedTotal - drawerAdjustment) * 100) / 100;
  const allAccepted = dus.length > 0 && dus.every((du) => acceptedByDu[du.duId]);
  const acceptedSummary = allAccepted
    ? {
        ...acceptedByDu[dus[0].duId],
        expectedTotal:
          dus.reduce((sum, du) => sum + acceptedByDu[du.duId].expectedFuelSales, 0) +
          acceptedByDu[dus[0].duId].merchandiseCash,
        declaredTotal: dus.reduce((sum, du) => sum + acceptedByDu[du.duId].declaredTotal, 0),
        // Each Drawer's server-reconciled variance (float and drops included).
        varianceAmount:
          Math.round(dus.reduce((sum, du) => sum + acceptedByDu[du.duId].varianceAmount, 0) * 100) /
          100,
      }
    : null;
  const shownSummary = selectHandoverSummary(
    { expectedTotal, declaredTotal, varianceAmount: varianceTotal },
    acceptedSummary,
  );
  const errorList = collectErrors();
  const formInvalid = errorList.length > 0;
  const priceOf = (productId: string) => Number(merchById[productId]?.sellingPrice || 0);
  const productsState = productsStep(merchRows, merchNonCash, priceOf);
  // Which steps hold an error, so the bar can say where to look.
  const failingSteps = Array.from(
    new Set(
      errorList.map((e) => {
        const duName = dus.find((du) => du.duId === e.duId)?.duName;
        return `${STEP_TITLE[e.step]}${dus.length > 1 && duName ? ` (${duName})` : ''}`;
      }),
    ),
  );

  const productsCard = (index: number) => (
    <StepCard
      index={index}
      title={STEP_TITLE.products}
      status={productsState.status}
      summary={dus.length > 1 ? `${productsState.summary} · all your pumps` : productsState.summary}
    >
      <ProductsFields
        rows={merchRows}
        options={merchOptions}
        productById={merchById}
        nonCash={merchNonCash}
        total={merchGross}
        onRowsChange={(rows) => {
          resetMerchandiseAcceptance();
          setEditedMerchRows(rows);
        }}
        onNonCashChange={(value) => {
          resetMerchandiseAcceptance();
          setEditedMerchNonCash(value);
        }}
      />
    </StepCard>
  );

  return (
    <div className="flex flex-col gap-3">
      <SummaryStrip
        summary={shownSummary}
        accepted={shownSummary.source === 'accepted'}
        context={`${data.station?.name ?? 'Station'} · ${data.shift?.templateName ?? 'Shift'}`}
      />

      {dus.map((du, duIndex) => {
        const form = forms[du.duId];
        if (!form) return null;
        const duProducts = duProductsFor(du);
        const credit = creditByDu[du.duId] || [];
        const omc = omcByDu[du.duId] || [];
        // Recorded and untouched since: cash reads "done" even though a zero
        // amount shows as an empty box.
        const recorded =
          Boolean(acceptedByDu[du.duId]) || (du.handover != null && !editedForms[du.duId]);
        const readings = readingsStep(du, form);
        const credits = creditStep(credit, omc);
        const terminals = terminalsStep(du, form, aggregateNonCashAllowed);
        const cash = cashStep(form, recorded);
        const expectedCash = expectedCashFor({
          du,
          form,
          credit,
          omc,
          merchCash,
          aggregateNonCashAllowed,
        });
        // Products are recorded once per person, so they sit in the first DU's set.
        const hasProducts = duIndex === 0;
        const float = Number(du.openingFloat || 0);

        return (
          <div key={du.duId} className="flex flex-col gap-2">
            <h2 className="px-1 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              {du.duName}
              {du.duCode ? <span className="text-text-faint"> · {du.duCode}</span> : null}
            </h2>

            {/* 1 · Closing readings + per-nozzle testing */}
            <StepCard
              index={1}
              title={STEP_TITLE.readings}
              status={readings.status}
              summary={readings.summary}
              defaultOpen
            >
              {du.nozzles.map((nz: any) => {
                const rawReading = form.readings[nz.nozzleId];
                const hasReading = rawReading !== '' && rawReading != null;
                const closing = num(rawReading);
                const vol = Math.max(0, closing - nz.openingReading);
                const readingError =
                  hasReading && closing < nz.openingReading
                    ? `Cannot be below opening (${nz.openingReading})`
                    : undefined;
                const testingVal = num(form.testing[nz.nozzleId]);
                const testingError =
                  testingVal < 0
                    ? 'Cannot be negative'
                    : testingVal > vol
                      ? `Cannot exceed ${vol.toFixed(2)} ${nz.unit}`
                      : undefined;
                return (
                  <div key={nz.nozzleId} className="grid grid-cols-2 gap-2.5">
                    <NumberField
                      label={`${nz.nozzleName} · ${nz.productName}`}
                      value={rawReading ?? ''}
                      onChange={(v) => setReading(du.duId, nz.nozzleId, v)}
                      meta={`Opening ${nz.openingReading}`}
                      sub={vol ? `${vol.toFixed(2)} ${nz.unit}` : 'enter closing'}
                      error={readingError}
                    />
                    <NumberField
                      label={`Testing (${nz.unit})`}
                      value={form.testing[nz.nozzleId] ?? ''}
                      onChange={(v) => setTesting(du.duId, nz.nozzleId, v)}
                      error={testingError}
                    />
                  </div>
                );
              })}
            </StepCard>

            {/* 2 · Credit and fuel-card sales (receivable / → CMS) */}
            <StepCard
              index={2}
              title={STEP_TITLE.credit}
              status={credits.status}
              summary={credits.summary}
            >
              <CustomerSaleForm
                duProducts={duProducts}
                customers={creditCustomers}
                allVehicles={allVehicles}
                credit={credit}
                omc={omc}
                busy={ccBusy}
                onAdd={(channel, line, key) => addCredit(du.duId, channel, line, key)}
                onRemove={(channel, id) => removeCredit(du.duId, channel, id)}
              />
            </StepCard>

            {/* 3 · Card / UPI per assigned terminal, or the aggregate fallback */}
            <StepCard
              index={3}
              title={STEP_TITLE.terminals}
              status={terminals.status}
              summary={terminals.summary}
            >
              {du.terminals.length > 0 ? (
                du.terminals.map((t: any) => (
                  <div
                    key={t.terminalId}
                    className="flex flex-col gap-2.5 rounded-xl border border-line bg-card-alt p-3"
                  >
                    <p className="text-xs font-bold text-text-high">{t.label}</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {t.supportsCard !== false && (
                        <NumberField
                          label="Card"
                          value={form.terminals[t.terminalId]?.card ?? ''}
                          onChange={(v) => setTerminal(du.duId, t.terminalId, 'card', v)}
                          error={
                            num(form.terminals[t.terminalId]?.card) < 0 ? 'No negatives' : undefined
                          }
                        />
                      )}
                      {t.supportsUpi !== false && (
                        <NumberField
                          label="UPI"
                          value={form.terminals[t.terminalId]?.upi ?? ''}
                          onChange={(v) => setTerminal(du.duId, t.terminalId, 'upi', v)}
                          error={
                            num(form.terminals[t.terminalId]?.upi) < 0 ? 'No negatives' : undefined
                          }
                        />
                      )}
                    </div>
                    <TextField
                      label="Batch ref (optional)"
                      value={form.terminals[t.terminalId]?.batch ?? ''}
                      onChange={(v) => setTerminal(du.duId, t.terminalId, 'batch', v)}
                    />
                  </div>
                ))
              ) : aggregateNonCashAllowed ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <NumberField
                      label="Card"
                      value={form.aggregateCard}
                      onChange={(v) => setAggregate(du.duId, 'aggregateCard', v)}
                    />
                    <NumberField
                      label="UPI"
                      value={form.aggregateUpi}
                      onChange={(v) => setAggregate(du.duId, 'aggregateUpi', v)}
                    />
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Aggregate declaration used because no Payment Terminal is configured.
                  </p>
                </>
              ) : (
                <p className="rounded-xl border border-line bg-card-alt p-3 text-xs text-text-muted">
                  No Payment Terminal is assigned to this Dispenser. Card and UPI declarations
                  require an assigned terminal.
                </p>
              )}
            </StepCard>

            {/* 4 · Products sold (once per person) */}
            {hasProducts ? productsCard(4) : null}

            {/* Last · Cash handed over */}
            <StepCard
              index={hasProducts ? 5 : 4}
              title={STEP_TITLE.cash}
              status={cash.status}
              summary={cash.summary}
            >
              <NumberField
                label={dus.length > 1 ? `${du.duName} · Cash (₹)` : 'Cash (₹)'}
                value={form.cash}
                onChange={(v) => setCash(du.duId, v)}
                error={num(form.cash) < 0 ? 'No negatives' : undefined}
                sub={float > 0 ? `Include your ${inr(float)} opening float` : undefined}
              />
              <button
                type="button"
                onClick={() => setSheetDuId(du.duId)}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong text-[13px] font-semibold text-accent"
              >
                <CalculatorIcon />
                Count notes
              </button>
              <NumberField
                label={dus.length > 1 ? `${du.duName} · Cash drops (₹)` : 'Cash drops (₹)'}
                value={form.drops}
                onChange={(v) => setDrops(du.duId, v)}
                error={num(form.drops) < 0 ? 'No negatives' : undefined}
              />
              <p className="text-[11px] leading-relaxed text-text-muted">
                Expected cash: <b className="num text-text-high">{inr(expectedCash.expected)}</b> =
                float <span className="num">{inr(expectedCash.float)}</span> + cash sales{' '}
                <span className="num">{inr(expectedCash.cashSales)}</span> − drops{' '}
                <span className="num">{inr(expectedCash.drops)}</span>
              </p>
              <p className="text-[11px] text-text-faint">
                Confirm physical cash at close. Hand over everything in the pouch, float included.
              </p>
            </StepCard>
          </div>
        );
      })}

      {/* Sticky bar: running variance + the one Save action */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-1.5 border-t border-dock-line bg-dock px-4 pb-3 pt-2.5 backdrop-blur">
        {error && (
          <p role="alert" className="text-center text-xs text-bad-fg">
            {error}
          </p>
        )}
        {formInvalid && !error && (
          <p className="text-center text-[11px] text-bad-fg">
            Fix {failingSteps.join(', ')} to save.
          </p>
        )}
        {savedAt && !saving && (
          <p className="text-center text-[11px] text-good">
            Saved at {savedAt}. You can edit and save again until the shift closes.
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-faint">
              Variance
            </p>
            <p
              className={`num text-[17px] font-semibold ${varianceTone(shownSummary.varianceAmount)}`}
            >
              {formatVariance(shownSummary.varianceAmount)}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              runTask(handleSave(), (error: unknown) =>
                console.error('Failed to save handover:', error),
              )
            }
            disabled={saving || formInvalid}
            className="h-12 flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save handover'}
          </button>
        </div>
      </div>

      <CashCountSheet
        open={sheetDuId != null}
        onClose={() => setSheetDuId(null)}
        breakdown={sheetDuId ? cashBreakdownByDu[sheetDuId] || {} : {}}
        onBreakdownChange={(b) => {
          if (sheetDuId) setCashBreakdownByDu((prev) => ({ ...prev, [sheetDuId]: b }));
        }}
        onApply={(t) => {
          if (sheetDuId) setCash(sheetDuId, String(t));
        }}
        currentValue={sheetDuId ? num(forms[sheetDuId]?.cash) : 0}
      />
    </div>
  );
};
