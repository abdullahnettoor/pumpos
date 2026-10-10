import { inr } from '@pump/ui';
import { reconcileDrawer, type DrawerReconciliation } from '@pump/shared';
import {
  num,
  type AssignedDu,
  type AssignedNozzle,
  type CreditLine,
  type DuFormState,
  type MerchRow,
} from '../../lib/handover/model.js';

/**
 * Step status, one-line summaries, validation and the expected-cash formula for
 * the handover form. Pure: the panel owns the state, this reads it.
 *
 * Validation here is the single source of truth. Every rule yields a
 * `HandoverError` naming the field it belongs to: `collectHandoverErrors` gates
 * the Save button, each step asks "do I have an error?", and `fieldErrorMap`
 * hands the same messages to the inputs, so a step's status and the fields it
 * highlights cannot drift apart.
 */

export type StepId = 'readings' | 'credit' | 'terminals' | 'products' | 'cash';

/**
 * `na`: the step cannot apply (no Payment Terminal and the Station does not
 * allow an aggregate declaration).
 */
export type StepStatus = 'done' | 'in-progress' | 'not-started' | 'error' | 'na';

export interface StepState {
  status: StepStatus;
  summary: string;
}

export interface HandoverError {
  step: StepId;
  /** Absent for the attendant-level products step. */
  duId?: string;
  /** The input this belongs to (see `fieldId`); absent for a whole-step error. */
  field?: string;
  /** Operator-facing text, shown under the field. */
  message: string;
}

/** Identifies one input within a DU's form. */
export const fieldId = {
  reading: (nozzleId: string) => `reading:${nozzleId}`,
  testing: (nozzleId: string) => `testing:${nozzleId}`,
  terminalCard: (terminalId: string) => `terminal-card:${terminalId}`,
  terminalUpi: (terminalId: string) => `terminal-upi:${terminalId}`,
  aggregateCard: 'aggregate-card',
  aggregateUpi: 'aggregate-upi',
  cash: 'cash',
  drops: 'drops',
} as const;

/** field id -> message, for one DU (the first error wins). */
export function fieldErrorMap(errors: HandoverError[], duId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors)
    if (e.duId === duId && e.field && !(e.field in out)) out[e.field] = e.message;
  return out;
}

const NO_NEGATIVES = 'No negatives';

const litres = (v: number) => `${Number(v.toFixed(2)).toLocaleString('en-IN')} L`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Litres metered past the opening reading, never below zero. */
const grossVolume = (nz: AssignedNozzle, form: DuFormState): number =>
  Math.max(0, num(form.readings[nz.nozzleId]) - nz.openingReading);

/** Litres sold net of testing, for one nozzle. */
export function nozzleNetVolume(nz: AssignedNozzle, form: DuFormState): number {
  return Math.max(0, grossVolume(nz, form) - num(form.testing[nz.nozzleId]));
}

/** Metered fuel value of a DU: Σ net litres × unit price. */
export function duFuelSales(du: AssignedDu, form: DuFormState): number {
  return du.nozzles.reduce((s, nz) => s + nozzleNetVolume(nz, form) * Number(nz.unitPrice || 0), 0);
}

export function readingsErrors(du: AssignedDu, form: DuFormState): HandoverError[] {
  const errs: HandoverError[] = [];
  const push = (field: string, message: string) =>
    errs.push({ step: 'readings', duId: du.duId, field, message });
  for (const nz of du.nozzles) {
    const raw = form.readings[nz.nozzleId];
    const hasReading = raw !== '' && raw != null;
    const closing = num(raw);
    const reading = fieldId.reading(nz.nozzleId);
    if (!hasReading) push(reading, 'Enter the closing reading');
    else if (closing < 0) push(reading, 'Cannot be negative');
    else if (closing < nz.openingReading)
      push(reading, `Cannot be below opening (${nz.openingReading})`);
    const vol = grossVolume(nz, form);
    const testingVal = num(form.testing[nz.nozzleId]);
    if (testingVal < 0) push(fieldId.testing(nz.nozzleId), 'Cannot be negative');
    else if (testingVal > vol)
      push(fieldId.testing(nz.nozzleId), `Cannot exceed ${vol.toFixed(2)} ${nz.unit}`);
  }
  return errs;
}

export function terminalErrors(
  du: AssignedDu,
  form: DuFormState,
  aggregateNonCashAllowed: boolean,
): HandoverError[] {
  const errs: HandoverError[] = [];
  const push = (field: string) =>
    errs.push({ step: 'terminals', duId: du.duId, field, message: NO_NEGATIVES });
  for (const t of du.terminals) {
    if (num(form.terminals[t.terminalId]?.card) < 0) push(fieldId.terminalCard(t.terminalId));
    if (num(form.terminals[t.terminalId]?.upi) < 0) push(fieldId.terminalUpi(t.terminalId));
  }
  if (aggregateNonCashAllowed) {
    if (num(form.aggregateCard) < 0) push(fieldId.aggregateCard);
    if (num(form.aggregateUpi) < 0) push(fieldId.aggregateUpi);
  }
  return errs;
}

export function cashErrors(du: AssignedDu, form: DuFormState): HandoverError[] {
  const errs: HandoverError[] = [];
  const push = (field: string) =>
    errs.push({ step: 'cash', duId: du.duId, field, message: NO_NEGATIVES });
  if (num(form.cash) < 0) push(fieldId.cash);
  if (num(form.drops) < 0) push(fieldId.drops);
  return errs;
}

function productsErrors(merchNonCash: string, merchRows: MerchRow[]): HandoverError[] {
  const errs: HandoverError[] = [];
  if (num(merchNonCash) < 0)
    errs.push({ step: 'products', message: 'Merchandise non-cash negative' });
  for (const r of merchRows)
    if (num(r.quantity) < 0) errs.push({ step: 'products', message: 'Merchandise qty negative' });
  return errs;
}

export function collectHandoverErrors(input: {
  dus: AssignedDu[];
  forms: Record<string, DuFormState>;
  aggregateNonCashAllowed: boolean;
  merchNonCash: string;
  merchRows: MerchRow[];
}): HandoverError[] {
  const errs: HandoverError[] = [];
  for (const du of input.dus) {
    const form = input.forms[du.duId];
    if (!form) continue;
    errs.push(
      ...readingsErrors(du, form),
      ...terminalErrors(du, form, input.aggregateNonCashAllowed),
      ...cashErrors(du, form),
    );
  }
  errs.push(...productsErrors(input.merchNonCash, input.merchRows));
  return errs;
}

/**
 * Step 1. Done once the attendant has entered or confirmed every nozzle's
 * closing reading and all are valid; in progress while only some are.
 */
export function readingsStep(du: AssignedDu, form: DuFormState): StepState {
  if (readingsErrors(du, form).length > 0)
    return { status: 'error', summary: 'Fix the highlighted readings' };
  const names = du.nozzles.map((nz) => nz.nozzleName).join(', ');
  const entered = du.nozzles.filter((nz) => form.confirmedReadings[nz.nozzleId]).length;
  if (entered === 0) return { status: 'not-started', summary: `${names} · enter closing readings` };
  if (entered < du.nozzles.length)
    return {
      status: 'in-progress',
      summary: `${entered} of ${du.nozzles.length} nozzles entered`,
    };
  const net = du.nozzles.reduce((s, nz) => s + nozzleNetVolume(nz, form), 0);
  return {
    status: 'done',
    summary: net > 0 ? `${names} · ${litres(net)} net` : `${names} · no litres yet`,
  };
}

/** Step 2. Optional: credit and fuel-card slips already recorded for this DU. */
export function creditStep(credit: CreditLine[], omc: CreditLine[]): StepState {
  const all = [...credit, ...omc];
  if (all.length === 0) return { status: 'not-started', summary: 'No slips · optional' };
  return { status: 'done', summary: `${plural(all.length, 'slip')} · ${inr(sumLines(all))}` };
}

/** Card + UPI declared for one DU: per-terminal, or the aggregate fallback. */
export function declaredNonCash(
  du: AssignedDu,
  form: DuFormState,
  aggregateNonCashAllowed: boolean,
): { card: number; upi: number } {
  if (du.terminals.length > 0) {
    return {
      card: du.terminals.reduce((s, t) => s + num(form.terminals[t.terminalId]?.card), 0),
      upi: du.terminals.reduce((s, t) => s + num(form.terminals[t.terminalId]?.upi), 0),
    };
  }
  return aggregateNonCashAllowed
    ? { card: num(form.aggregateCard), upi: num(form.aggregateUpi) }
    : { card: 0, upi: 0 };
}

/** Step 3. Done once any card/UPI is declared; a lone batch reference is in progress. */
export function terminalsStep(
  du: AssignedDu,
  form: DuFormState,
  aggregateNonCashAllowed: boolean,
): StepState {
  if (terminalErrors(du, form, aggregateNonCashAllowed).length > 0)
    return { status: 'error', summary: 'Fix the highlighted amounts' };
  const { card, upi } = declaredNonCash(du, form, aggregateNonCashAllowed);
  const total = card + upi;
  if (du.terminals.length === 0) {
    if (!aggregateNonCashAllowed) return { status: 'na', summary: 'No Payment Terminal assigned' };
    return total > 0
      ? { status: 'done', summary: `Aggregate · ${inr(total)}` }
      : { status: 'not-started', summary: 'Not entered' };
  }
  if (total > 0) {
    const used = du.terminals.filter(
      (t) => num(form.terminals[t.terminalId]?.card) + num(form.terminals[t.terminalId]?.upi) > 0,
    );
    const labels = used.map((t) => t.label).join(', ');
    return { status: 'done', summary: `${labels} · ${inr(total)}` };
  }
  const batchOnly = du.terminals.some((t) => form.terminals[t.terminalId]?.batch);
  return batchOnly
    ? { status: 'in-progress', summary: 'Batch reference only · enter amounts' }
    : { status: 'not-started', summary: 'Not entered' };
}

/** Value of the merchandise lines at MRP. */
export function merchTotal(rows: MerchRow[], priceOf: (productId: string) => number): number {
  return rows.reduce((s, r) => s + num(r.quantity) * priceOf(r.productId), 0);
}

/** Step 4. Optional. A line missing its product or its quantity is in progress. */
export function productsStep(
  merchRows: MerchRow[],
  merchNonCash: string,
  priceOf: (productId: string) => number,
): StepState {
  if (productsErrors(merchNonCash, merchRows).length > 0)
    return { status: 'error', summary: 'Fix the highlighted quantities' };
  const complete = merchRows.filter((r) => r.productId && num(r.quantity) > 0);
  const partial = merchRows.some((r) => Boolean(r.productId) !== num(r.quantity) > 0);
  if (partial) return { status: 'in-progress', summary: 'Finish the product line' };
  if (complete.length === 0) return { status: 'not-started', summary: 'None · optional' };
  const total = merchTotal(complete, priceOf);
  return { status: 'done', summary: `${plural(complete.length, 'item')} · ${inr(total)}` };
}

/**
 * Step 5. Done once a valid amount is entered (zero counts: an empty drawer is
 * an answer) or the Handover has already been recorded and left untouched.
 */
export function cashStep(form: DuFormState, recorded: boolean): StepState {
  const drops = num(form.drops);
  if (num(form.cash) < 0 || drops < 0)
    return { status: 'error', summary: 'Fix the highlighted amounts' };
  const dropText = drops > 0 ? ` · drops ${inr(drops)}` : '';
  const entered = form.cash !== '' || recorded;
  return entered
    ? { status: 'done', summary: `${inr(num(form.cash))} handed over${dropText}` }
    : { status: 'not-started', summary: `Not confirmed${dropText}` };
}

/** Σ of the slips' amounts. */
const sumLines = (lines: CreditLine[]): number =>
  lines.reduce((s, l) => s + Number(l.amount || 0), 0);

/** One Drawer's reconciliation, with the float and drops it was computed from. */
export interface DuReconciliation extends DrawerReconciliation {
  openingFloat: number;
  cashDrops: number;
}

/**
 * One Drawer's reconciliation as the server will compute it on save (the shared
 * `reconcileDrawer`, ADR 0005): `expectedCash` is float + cash sales − drops,
 * where cash sales are the metered fuel plus merchandise cash less everything
 * settled by card, UPI, credit or fuel card.
 *
 * `merchCash` is what the server attributes to this Handover. The server reads
 * the attendant's merchandise cash per attendant, not per DU, so today it is
 * the same figure for every DU the attendant holds (double-counted, #419);
 * pass it to every DU to stay faithful to what is saved, and change it here
 * once the server attributes it to one Drawer.
 */
export function reconcileDu(input: {
  du: AssignedDu;
  form: DuFormState;
  credit: CreditLine[];
  omc: CreditLine[];
  merchCash: number;
  aggregateNonCashAllowed: boolean;
}): DuReconciliation {
  const { du, form } = input;
  const { card, upi } = declaredNonCash(du, form, input.aggregateNonCashAllowed);
  const openingFloat = Number(du.openingFloat || 0);
  const cashDrops = num(form.drops);
  return {
    ...reconcileDrawer({
      openingFloat,
      expectedFuelSales: duFuelSales(du, form),
      merchandiseCash: input.merchCash,
      cardHandedOver: card,
      upiHandedOver: upi,
      creditSales: sumLines(input.credit),
      omcCardSales: sumLines(input.omc),
      cashHandedOver: num(form.cash),
      cashDrops,
    }),
    openingFloat,
    cashDrops,
  };
}
