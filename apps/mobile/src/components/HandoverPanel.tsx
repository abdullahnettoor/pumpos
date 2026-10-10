import React, { useMemo, useState } from 'react';
import {
  useMyAssignment,
  useProducts,
  useCustomers,
  useAllVehicles,
  useInventoryItems,
  useMerchandiseHandovers,
  selectHandoverSummary,
  inr,
  runTask,
  type CashBreakdown,
  type RecordHandoverResult,
} from '@pump/ui';
import { CashCountSheet } from './CashCountSheet.js';
import { CustomerSaleForm } from './handover/CustomerSaleForm.js';
import { NumberField } from './handover/Fields.js';
import { CalculatorIcon } from './handover/icons.js';
import {
  blankZero,
  num,
  seedForm,
  type AssignedDu,
  type DuFormState,
  type DuProduct,
  type MerchProduct,
  type MyAssignment,
} from './handover/model.js';
import { ProductsFields } from './handover/ProductsFields.js';
import { StepCard } from './handover/StepCard.js';
import {
  cashStep,
  collectHandoverErrors,
  creditStep,
  fieldErrorMap,
  fieldId,
  merchTotal,
  productsStep,
  readingsStep,
  reconcileDu,
  terminalsStep,
  type StepId,
} from './handover/steps.js';
import { SummaryStrip, formatVariance, varianceTone } from './handover/SummaryStrip.js';
import { TerminalsFields } from './handover/TerminalsFields.js';
import { useHandoverSubmission } from './handover/useHandoverSubmission.js';

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
 * no draft — a save is re-saveable until the Shift closes). This component owns
 * what the attendant has typed; validation, step status and the Drawer maths
 * live in ./handover/steps (pure), and saving in ./handover/useHandoverSubmission.
 */

const STEP_TITLE: Record<StepId, string> = {
  readings: 'Closing readings',
  credit: 'Credit & fuel-card sales',
  terminals: 'Card / UPI',
  products: 'Products sold',
  cash: 'Cash handed over',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const HandoverPanel: React.FC<{
  /** Called after a save in which every DU's Handover was accepted. */
  onRecorded?: (results: RecordHandoverResult[]) => void;
}> = ({ onRecorded }) => {
  const assignmentQ = useMyAssignment();
  const productsQ = useProducts();
  const customersQ = useCustomers(true);
  const vehiclesQ = useAllVehicles(true);

  const data: MyAssignment | null | undefined = assignmentQ.data;
  // Memoised: a bare `?? []` gives the memos below a new array identity every
  // render, which would recompute them on each keystroke.
  const dus: AssignedDu[] = useMemo(() => data?.dispenserUnits ?? [], [data?.dispenserUnits]);
  const shiftId = data?.shift?.id;
  const attendantId = data?.userId;
  const stationId = data?.station?.id ?? data?.shift?.stationId;
  const aggregateNonCashAllowed = data?.stationHasConfiguredTerminals === false;
  const inventoryQ = useInventoryItems(stationId ?? null);
  const merchHandoversQ = useMerchandiseHandovers(shiftId ?? null);

  const [editedForms, setEditedForms] = useState<Record<string, DuFormState>>({});
  const [editedMerchRows, setEditedMerchRows] = useState<
    { productId: string; quantity: string }[] | null
  >(null);
  const [editedMerchNonCash, setEditedMerchNonCash] = useState<string | null>(null);
  // Cash denomination counter (bottom sheet): which DU's sheet is open + per-DU
  // counts (parent-held so re-opening preserves them; future backend = drop-in).
  const [sheetDuId, setSheetDuId] = useState<string | null>(null);
  const [cashBreakdownByDu, setCashBreakdownByDu] = useState<Record<string, CashBreakdown>>({});

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

  // Merchandise products (non-fuel), for the add-line picker.
  const merchProducts = useMemo(
    () =>
      ((productsQ.data || []) as MerchProduct[]).filter(
        (p: MerchProduct) => p.productType && p.productType !== 'FUEL' && p.isActive !== false,
      ),
    [productsQ.data],
  );
  const merchById = useMemo(() => {
    const m: Record<string, MerchProduct> = {};
    for (const p of merchProducts) m[p.id] = p;
    return m;
  }, [merchProducts]);

  // On-hand stock per merchandise product (shown in the picker, like desktop).
  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    (inventoryQ.data || []).forEach((i: { productId: string; quantity: number | string }) => {
      m[i.productId] = Number(i.quantity);
    });
    return m;
  }, [inventoryQ.data]);

  const merchOptions = useMemo(
    () =>
      merchProducts.map((pr) => {
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
    () =>
      (merchHandoversQ.data ?? []).find(
        (h: { attendantId: string }) => h.attendantId === attendantId,
      ),
    [merchHandoversQ.data, attendantId],
  );
  const merchRows = useMemo<{ productId: string; quantity: string }[]>(() => {
    if (editedMerchRows) return editedMerchRows;
    const items = myMerchandise?.items ?? [];
    return items.length
      ? items.map((it: { productId: string; quantity: number | string }) => ({
          productId: it.productId,
          quantity: String(Number(it.quantity)),
        }))
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
    () =>
      (customersQ.data || []).filter(
        (c: { customerType?: string; isPrepaid?: boolean }) =>
          c.customerType === 'Fleet' || !c.isPrepaid,
      ),
    [customersQ.data],
  );
  // Cached vehicles (semi tier, persisted) — no server search.
  const allVehicles = useMemo(() => vehiclesQ.data ?? [], [vehiclesQ.data]);

  const duProductsFor = (du: AssignedDu): DuProduct[] =>
    Array.from(
      new Map(
        du.nozzles
          .filter((n) => n.productId)
          .map((n): [string, DuProduct] => [
            n.productId as string,
            {
              id: n.productId as string,
              name: n.productName ?? 'Fuel',
              unit: n.unit ?? 'L',
              price: Number(n.unitPrice || 0),
            },
          ]),
      ).values(),
    );

  // Merchandise: gross at MRP, and the cash share the server attributes.
  const priceOf = (productId: string) => Number(merchById[productId]?.sellingPrice || 0);
  const merchGross = merchTotal(merchRows, priceOf);
  const merchCash = Math.max(0, merchGross - num(merchNonCash));

  const errorList = collectHandoverErrors({
    dus,
    forms,
    aggregateNonCashAllowed,
    merchNonCash,
    merchRows,
  });
  const formInvalid = errorList.length > 0;

  /** Echo what the server accepted back into the form, so the inputs read as saved. */
  const onHandoverAccepted = (du: AssignedDu, result: RecordHandoverResult) =>
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
        confirmedReadings: Object.fromEntries(
          result.nozzleReadings.map((reading) => [reading.nozzleId, true]),
        ),
        testing: Object.fromEntries(
          result.nozzleReadings.map((reading) => [
            reading.nozzleId,
            blankZero(reading.testingVolume),
          ]),
        ),
        terminals: Object.fromEntries(
          du.terminals.map((terminal) => {
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

  const submission = useHandoverSubmission({
    dus,
    forms,
    shiftId,
    attendantId,
    stationId,
    aggregateNonCashAllowed,
    merchRows,
    merchNonCash,
    hasErrors: formInvalid,
    onHandoverAccepted,
    onRecorded,
  });
  const {
    creditByDu,
    omcByDu,
    acceptedByDu,
    resetAcceptedHandover,
    resetMerchandiseAcceptance,
    clearZeroTerminalsConfirmation,
    saving,
    savedAt,
    error,
  } = submission;

  /** Applies a change to one DU's form; any edit makes a saved Handover stale. */
  const editForm = (duId: string, change: (form: DuFormState) => DuFormState) => {
    resetAcceptedHandover(duId);
    setEditedForms((f) => ({ ...f, [duId]: change(f[duId] ?? forms[duId]) }));
  };
  const setReading = (duId: string, nozzleId: string, v: string) =>
    editForm(duId, (f) => ({
      ...f,
      readings: { ...f.readings, [nozzleId]: v },
      confirmedReadings: { ...f.confirmedReadings, [nozzleId]: true },
    }));
  /** Leaving a closing reading confirms it as is: a nozzle that did not move still reads its opening. */
  const confirmReading = (duId: string, nozzleId: string) => {
    if (forms[duId]?.confirmedReadings[nozzleId]) return;
    setEditedForms((f) => {
      const form = f[duId] ?? forms[duId];
      return {
        ...f,
        [duId]: { ...form, confirmedReadings: { ...form.confirmedReadings, [nozzleId]: true } },
      };
    });
  };
  const setTesting = (duId: string, nozzleId: string, v: string) =>
    editForm(duId, (f) => ({ ...f, testing: { ...f.testing, [nozzleId]: v } }));
  const setCash = (duId: string, v: string) => editForm(duId, (f) => ({ ...f, cash: v }));
  const setDrops = (duId: string, v: string) => editForm(duId, (f) => ({ ...f, drops: v }));
  const setAggregate = (duId: string, field: 'aggregateCard' | 'aggregateUpi', v: string) => {
    clearZeroTerminalsConfirmation();
    editForm(duId, (f) => ({ ...f, [field]: v }));
  };
  const setTerminal = (
    duId: string,
    terminalId: string,
    field: 'card' | 'upi' | 'batch',
    v: string,
  ) => {
    clearZeroTerminalsConfirmation();
    editForm(duId, (f) => ({
      ...f,
      terminals: { ...f.terminals, [terminalId]: { ...f.terminals[terminalId], [field]: v } },
    }));
  };

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

  // Each Drawer reconciled as the server will on save; the strip is their sum.
  const reconciliations = Object.fromEntries(
    dus.map((du) => [
      du.duId,
      forms[du.duId]
        ? reconcileDu({
            du,
            form: forms[du.duId],
            credit: creditByDu[du.duId] ?? [],
            omc: omcByDu[du.duId] ?? [],
            merchCash,
            aggregateNonCashAllowed,
          })
        : null,
    ]),
  );
  const live = Object.values(reconciliations).reduce(
    (sum, r) => ({
      expectedTotal: sum.expectedTotal + (r?.expectedTotal ?? 0),
      declaredTotal: sum.declaredTotal + (r?.declaredTotal ?? 0),
      varianceAmount: sum.varianceAmount + (r?.varianceAmount ?? 0),
    }),
    { expectedTotal: 0, declaredTotal: 0, varianceAmount: 0 },
  );
  live.varianceAmount = round2(live.varianceAmount);
  const allAccepted = dus.length > 0 && dus.every((du) => acceptedByDu[du.duId]);
  const acceptedSummary = allAccepted
    ? {
        ...acceptedByDu[dus[0].duId],
        // The server's own per-Drawer figures, summed the same way as the preview.
        expectedTotal: dus.reduce((sum, du) => sum + acceptedByDu[du.duId].expectedTotal, 0),
        declaredTotal: dus.reduce((sum, du) => sum + acceptedByDu[du.duId].declaredTotal, 0),
        varianceAmount: round2(
          dus.reduce((sum, du) => sum + acceptedByDu[du.duId].varianceAmount, 0),
        ),
      }
    : null;
  const shownSummary = selectHandoverSummary(live, acceptedSummary);
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
        const reconciliation = reconciliations[du.duId];
        if (!form || !reconciliation) return null;
        const duProducts = duProductsFor(du);
        const credit = creditByDu[du.duId] || [];
        const omc = omcByDu[du.duId] || [];
        const errors = fieldErrorMap(errorList, du.duId);
        // Recorded and untouched since: cash reads "done" even though a zero
        // amount shows as an empty box.
        const recorded =
          Boolean(acceptedByDu[du.duId]) || (du.handover != null && !editedForms[du.duId]);
        const readings = readingsStep(du, form);
        const credits = creditStep(credit, omc);
        const terminals = terminalsStep(du, form, aggregateNonCashAllowed);
        const cash = cashStep(form, recorded);
        // Products are recorded once per person, so they sit in the first DU's set.
        const hasProducts = duIndex === 0;
        const float = reconciliation.openingFloat;

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
              {du.nozzles.map((nz) => {
                const closing = num(form.readings[nz.nozzleId]);
                const vol = Math.max(0, closing - nz.openingReading);
                return (
                  <div key={nz.nozzleId} className="grid grid-cols-2 gap-2.5">
                    <NumberField
                      label={`${nz.nozzleName} · ${nz.productName}`}
                      value={form.readings[nz.nozzleId] ?? ''}
                      onChange={(v) => setReading(du.duId, nz.nozzleId, v)}
                      onBlur={() => confirmReading(du.duId, nz.nozzleId)}
                      meta={`Opening ${nz.openingReading}`}
                      sub={vol ? `${vol.toFixed(2)} ${nz.unit}` : 'enter closing'}
                      error={errors[fieldId.reading(nz.nozzleId)]}
                    />
                    <NumberField
                      label={`Testing (${nz.unit})`}
                      value={form.testing[nz.nozzleId] ?? ''}
                      onChange={(v) => setTesting(du.duId, nz.nozzleId, v)}
                      error={errors[fieldId.testing(nz.nozzleId)]}
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
                busy={submission.ccBusy}
                onAdd={(channel, line, key) => submission.addCredit(du.duId, channel, line, key)}
                onRemove={(channel, id) => submission.removeCredit(du.duId, channel, id)}
              />
            </StepCard>

            {/* 3 · Card / UPI per assigned terminal, or the aggregate fallback */}
            <StepCard
              index={3}
              title={STEP_TITLE.terminals}
              status={terminals.status}
              summary={terminals.summary}
            >
              <TerminalsFields
                du={du}
                form={form}
                aggregateNonCashAllowed={aggregateNonCashAllowed}
                errors={errors}
                onTerminalChange={(terminalId, field, v) =>
                  setTerminal(du.duId, terminalId, field, v)
                }
                onAggregateChange={(field, v) => setAggregate(du.duId, field, v)}
              />
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
                error={errors[fieldId.cash]}
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
                error={errors[fieldId.drops]}
              />
              <p className="text-[11px] leading-relaxed text-text-muted">
                Expected cash:{' '}
                <b className="num text-text-high">{inr(reconciliation.expectedCash)}</b> = float{' '}
                <span className="num">{inr(reconciliation.openingFloat)}</span> + cash sales{' '}
                <span className="num">{inr(reconciliation.cashSales)}</span> − drops{' '}
                <span className="num">{inr(reconciliation.cashDrops)}</span>
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
              runTask(submission.save(), (error: unknown) =>
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
