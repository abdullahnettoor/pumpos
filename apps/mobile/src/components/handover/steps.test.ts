import { describe, expect, it } from 'vitest';
import { seedForm, type DuFormState } from './model.js';
import {
  cashStep,
  collectHandoverErrors,
  creditStep,
  expectedCashFor,
  productsStep,
  readingsStep,
  terminalsStep,
} from './steps.js';

const du = (over: Record<string, unknown> = {}): any => ({
  duId: 'du-1',
  duName: 'DU 1',
  openingFloat: 2000,
  nozzles: [
    { nozzleId: 'n1', nozzleName: 'N1', unit: 'L', unitPrice: 100, openingReading: 1000 },
    { nozzleId: 'n2', nozzleName: 'N2', unit: 'L', unitPrice: 90, openingReading: 500 },
  ],
  terminals: [],
  ...over,
});

const form = (d: any, over: Partial<DuFormState> = {}): DuFormState => ({
  ...seedForm(d),
  ...over,
});

const line = (amount: number): any => ({ amount });
const price = (id: string) => ({ oil: 400, coolant: 250 })[id as 'oil'] ?? 0;

describe('readingsStep', () => {
  it('is done when every nozzle has a valid closing reading', () => {
    const d = du();
    const f = form(d, { readings: { n1: '1050', n2: '520' }, testing: { n1: '5', n2: '' } });
    expect(readingsStep(d, f)).toEqual({ status: 'done', summary: 'N1, N2 · 65 L net' });
  });

  it('is an error when a closing reading is below its opening', () => {
    const d = du();
    const f = form(d, { readings: { n1: '900', n2: '520' } });
    expect(readingsStep(d, f).status).toBe('error');
  });

  it('is an error when a closing reading is cleared', () => {
    const d = du();
    const f = form(d, { readings: { n1: '', n2: '520' } });
    expect(readingsStep(d, f).status).toBe('error');
  });

  it('is an error when testing exceeds the litres sold', () => {
    const d = du();
    const f = form(d, { readings: { n1: '1010', n2: '500' }, testing: { n1: '50', n2: '' } });
    expect(readingsStep(d, f).status).toBe('error');
  });
});

describe('creditStep', () => {
  it('is optional and not started with no slips', () => {
    expect(creditStep([], [])).toEqual({ status: 'not-started', summary: 'No slips · optional' });
  });

  it('counts credit and fuel-card slips together', () => {
    expect(creditStep([line(1000)], [line(250)])).toEqual({
      status: 'done',
      summary: '2 slips · ₹1,250.00',
    });
  });
});

describe('terminalsStep', () => {
  const withTerminals = () =>
    du({
      terminals: [
        { terminalId: 't1', label: 'POS 1' },
        { terminalId: 't2', label: 'POS 2' },
      ],
    });

  it('is not started until something is entered', () => {
    const d = withTerminals();
    expect(terminalsStep(d, form(d), false).status).toBe('not-started');
  });

  it('is in progress with only a batch reference', () => {
    const d = withTerminals();
    const f = form(d, {
      terminals: { t1: { card: '', upi: '', batch: 'B1' }, t2: seedForm(d).terminals.t2 },
    });
    expect(terminalsStep(d, f, false).status).toBe('in-progress');
  });

  it('is done once a terminal has card or UPI, naming only the terminals used', () => {
    const d = withTerminals();
    const f = form(d, {
      terminals: { t1: { card: '1000', upi: '500', batch: '' }, t2: seedForm(d).terminals.t2 },
    });
    const s = terminalsStep(d, f, false);
    expect(s.status).toBe('done');
    expect(s.summary).toContain('POS 1');
    expect(s.summary).not.toContain('POS 2');
  });

  it('falls back to the aggregate when the Station has no terminals', () => {
    const d = du();
    expect(terminalsStep(d, form(d, { aggregateCard: '300' }), true).status).toBe('done');
    expect(terminalsStep(d, form(d), true).status).toBe('not-started');
  });

  it('does not apply with no terminal and no aggregate allowance', () => {
    const d = du();
    expect(terminalsStep(d, form(d), false).status).toBe('na');
  });

  it('is an error for a negative amount', () => {
    const d = withTerminals();
    const f = form(d, {
      terminals: { t1: { card: '-5', upi: '', batch: '' }, t2: seedForm(d).terminals.t2 },
    });
    expect(terminalsStep(d, f, false).status).toBe('error');
  });
});

describe('productsStep', () => {
  it('is optional and not started with no lines', () => {
    expect(productsStep([{ productId: '', quantity: '' }], '', price)).toEqual({
      status: 'not-started',
      summary: 'None · optional',
    });
  });

  it('is done with a complete line, totalled at MRP', () => {
    const s = productsStep([{ productId: 'oil', quantity: '2' }], '', price);
    expect(s).toEqual({ status: 'done', summary: '1 item · ₹800.00' });
  });

  it('is in progress when a line has a product but no quantity', () => {
    expect(productsStep([{ productId: 'oil', quantity: '' }], '', price).status).toBe(
      'in-progress',
    );
  });

  it('is in progress when a line has a quantity but no product', () => {
    expect(productsStep([{ productId: '', quantity: '2' }], '', price).status).toBe('in-progress');
  });

  it('is an error for a negative quantity or non-cash portion', () => {
    expect(productsStep([{ productId: 'oil', quantity: '-1' }], '', price).status).toBe('error');
    expect(productsStep([], '-5', price).status).toBe('error');
  });
});

describe('cashStep', () => {
  const d = du();

  it('is not started until an amount is entered', () => {
    expect(cashStep(form(d), false)).toEqual({ status: 'not-started', summary: 'Not confirmed' });
  });

  it('is done once a valid amount is entered, zero included', () => {
    expect(cashStep(form(d, { cash: '5000' }), false).status).toBe('done');
    expect(cashStep(form(d, { cash: '0' }), false).status).toBe('done');
  });

  it('is done when the handover was already recorded and left untouched', () => {
    expect(cashStep(form(d), true).status).toBe('done');
  });

  it('mentions cash drops either way', () => {
    expect(cashStep(form(d, { drops: '20000' }), false).summary).toBe(
      'Not confirmed · drops ₹20,000.00',
    );
  });

  it('is an error for a negative amount', () => {
    expect(cashStep(form(d, { cash: '-1' }), false).status).toBe('error');
    expect(cashStep(form(d, { drops: '-1' }), false).status).toBe('error');
  });
});

describe('collectHandoverErrors', () => {
  const base = (d: any, f: DuFormState) => ({
    dus: [d],
    forms: { [d.duId]: f },
    aggregateNonCashAllowed: true,
    merchNonCash: '',
    merchRows: [{ productId: '', quantity: '' }],
  });

  it('is empty for the seeded form', () => {
    const d = du();
    expect(collectHandoverErrors(base(d, form(d)))).toEqual([]);
  });

  it('tags each error with its step', () => {
    const d = du();
    const f = form(d, {
      readings: { n1: '900', n2: '500' },
      cash: '-1',
      aggregateCard: '-2',
    });
    const steps = collectHandoverErrors(base(d, f)).map((e) => e.step);
    expect(new Set(steps)).toEqual(new Set(['readings', 'cash', 'terminals']));
  });

  it('flags merchandise errors without a DU', () => {
    const d = du();
    const errs = collectHandoverErrors({
      ...base(d, form(d)),
      merchNonCash: '-1',
      merchRows: [{ productId: 'oil', quantity: '-2' }],
    });
    expect(errs.every((e) => e.step === 'products' && e.duId === undefined)).toBe(true);
    expect(errs).toHaveLength(2);
  });
});

describe('expectedCashFor', () => {
  it('is float + cash sales − drops, cash sales net of card, UPI and credit', () => {
    const d = du({ nozzles: [du().nozzles[0]] });
    // 50 L × ₹100 = ₹5,000 metered.
    const f = form(d, {
      readings: { n1: '1050' },
      aggregateCard: '1000',
      aggregateUpi: '500',
      drops: '500',
    });
    const r = expectedCashFor({
      du: d,
      form: f,
      credit: [line(700)],
      omc: [line(300)],
      merchCash: 400,
      aggregateNonCashAllowed: true,
    });
    expect(r).toEqual({ float: 2000, cashSales: 2900, drops: 500, expected: 4400 });
  });
});
