import { inr } from '@pump/ui';
import { num, type CreditLine, type DuFormState, type MerchRow } from './model.js';

/**
 * Step status, one-line summaries, validation and the expected-cash formula for
 * the handover form. Pure: the panel owns the state, this reads it.
 *
 * Validation here is the single source of truth. `collectHandoverErrors` gates
 * the Save button exactly as before; each step also asks "do I have an error?"
 * from the same rules, so a collapsed step can show it.
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
  message: string;
}

const litres = (v: number) => `${Number(v.toFixed(2)).toLocaleString('en-IN')} L`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Litres sold net of testing, for one nozzle. */
function nozzleNetVolume(nz: any, form: DuFormState): number {
  const vol = Math.max(0, num(form.readings[nz.nozzleId]) - nz.openingReading);
  return Math.max(0, vol - num(form.testing[nz.nozzleId]));
}

export function readingsErrors(du: any, form: DuFormState): HandoverError[] {
  const errs: HandoverError[] = [];
  const push = (message: string) => errs.push({ step: 'readings', duId: du.duId, message });
  for (const nz of du.nozzles) {
    const raw = form.readings[nz.nozzleId];
    const hasReading = raw !== '' && raw != null;
    const closing = num(raw);
    if (!hasReading) push(`${nz.nozzleName}: closing reading required`);
    if (hasReading && closing < nz.openingReading) push(`${nz.nozzleName}: closing below opening`);
    if (closing < 0) push(`${nz.nozzleName}: negative reading`);
    const vol = Math.max(0, closing - nz.openingReading);
    const testingVal = num(form.testing[nz.nozzleId]);
    if (testingVal < 0) push(`${nz.nozzleName}: testing negative`);
    else if (testingVal > vol) push(`${nz.nozzleName}: testing exceeds sold volume`);
  }
  return errs;
}

export function terminalErrors(
  du: any,
  form: DuFormState,
  aggregateNonCashAllowed: boolean,
): HandoverError[] {
  const errs: HandoverError[] = [];
  const push = (message: string) => errs.push({ step: 'terminals', duId: du.duId, message });
  for (const t of du.terminals) {
    if (num(form.terminals[t.terminalId]?.card) < 0 || num(form.terminals[t.terminalId]?.upi) < 0)
      push(`${du.duName}: negative POS amount`);
  }
  if (aggregateNonCashAllowed && (num(form.aggregateCard) < 0 || num(form.aggregateUpi) < 0))
    push(`${du.duName}: negative non-cash amount`);
  return errs;
}

export function cashErrors(du: any, form: DuFormState): HandoverError[] {
  const errs: HandoverError[] = [];
  if (num(form.cash) < 0)
    errs.push({ step: 'cash', duId: du.duId, message: `${du.duName}: negative cash` });
  if (num(form.drops) < 0)
    errs.push({ step: 'cash', duId: du.duId, message: `${du.duName}: negative cash drops` });
  return errs;
}

export function productsErrors(merchNonCash: string, merchRows: MerchRow[]): HandoverError[] {
  const errs: HandoverError[] = [];
  if (num(merchNonCash) < 0)
    errs.push({ step: 'products', message: 'Merchandise non-cash negative' });
  for (const r of merchRows)
    if (num(r.quantity) < 0) errs.push({ step: 'products', message: 'Merchandise qty negative' });
  return errs;
}

export function collectHandoverErrors(input: {
  dus: any[];
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

/** Step 1. Done once every nozzle has a valid closing reading and testing volume. */
export function readingsStep(du: any, form: DuFormState): StepState {
  if (readingsErrors(du, form).length > 0)
    return { status: 'error', summary: 'Fix the highlighted readings' };
  const names = du.nozzles.map((nz: any) => nz.nozzleName).join(', ');
  const net = du.nozzles.reduce((s: number, nz: any) => s + nozzleNetVolume(nz, form), 0);
  return {
    status: 'done',
    summary: net > 0 ? `${names} · ${litres(net)} net` : `${names} · no litres yet`,
  };
}

/** Step 2. Optional: credit and fuel-card slips already recorded for this DU. */
export function creditStep(credit: CreditLine[], omc: CreditLine[]): StepState {
  const all = [...credit, ...omc];
  if (all.length === 0) return { status: 'not-started', summary: 'No slips · optional' };
  const total = all.reduce((s, l) => s + Number(l.amount || 0), 0);
  return { status: 'done', summary: `${plural(all.length, 'slip')} · ${inr(total)}` };
}

/** Card + UPI declared for one DU: per-terminal, or the aggregate fallback. */
export function declaredNonCash(
  du: any,
  form: DuFormState,
  aggregateNonCashAllowed: boolean,
): { card: number; upi: number } {
  if (du.terminals.length > 0) {
    return {
      card: du.terminals.reduce(
        (s: number, t: any) => s + num(form.terminals[t.terminalId]?.card),
        0,
      ),
      upi: du.terminals.reduce(
        (s: number, t: any) => s + num(form.terminals[t.terminalId]?.upi),
        0,
      ),
    };
  }
  return aggregateNonCashAllowed
    ? { card: num(form.aggregateCard), upi: num(form.aggregateUpi) }
    : { card: 0, upi: 0 };
}

/** Step 3. Done once any card/UPI is declared; a lone batch reference is in progress. */
export function terminalsStep(
  du: any,
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
      (t: any) =>
        num(form.terminals[t.terminalId]?.card) + num(form.terminals[t.terminalId]?.upi) > 0,
    );
    const labels = used.map((t: any) => t.label).join(', ');
    return { status: 'done', summary: `${labels} · ${inr(total)}` };
  }
  const batchOnly = du.terminals.some((t: any) => form.terminals[t.terminalId]?.batch);
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

export interface ExpectedCash {
  float: number;
  cashSales: number;
  drops: number;
  expected: number;
}

/**
 * The Drawer's expected cash, the way the server reconciles it (ADR 0005):
 * float + cash sales − drops, where cash sales are the metered fuel value plus
 * merchandise cash, less everything settled by card, UPI, credit or fuel card.
 */
export function expectedCashFor(input: {
  du: any;
  form: DuFormState;
  credit: CreditLine[];
  omc: CreditLine[];
  merchCash: number;
  aggregateNonCashAllowed: boolean;
}): ExpectedCash {
  const { du, form } = input;
  const fuel = du.nozzles.reduce(
    (s: number, nz: any) => s + nozzleNetVolume(nz, form) * Number(nz.unitPrice || 0),
    0,
  );
  const { card, upi } = declaredNonCash(du, form, input.aggregateNonCashAllowed);
  const sum = (lines: CreditLine[]) => lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const cashSales =
    Math.round((fuel + input.merchCash - card - upi - sum(input.credit) - sum(input.omc)) * 100) /
    100;
  const float = Number(du.openingFloat || 0);
  const drops = num(form.drops);
  return { float, cashSales, drops, expected: Math.round((float + cashSales - drops) * 100) / 100 };
}
