import { describe, expect, it } from 'vitest';
import { seedForm, type AssignedDu, type CreditLine, type DuFormState } from './model.js';
import {
  cashErrors,
  cashStep,
  collectHandoverErrors,
  creditStep,
  fieldErrorMap,
  fieldId,
  declaredNonCash,
  duFuelSales,
  merchTotal,
  merchandiseCash,
  nozzleGrossVolume,
  sumReconciliations,
  nozzleNetVolume,
  readingsErrors,
  reconcileDu,
  terminalErrors,
  productsStep,
  readingsStep,
  terminalsStep,
} from './steps.js';

const du = (over: Record<string, unknown> = {}): AssignedDu => ({
  duId: 'du-1',
  duName: 'DU 1',
  openingFloat: 2000,
  nozzles: [
    {
      nozzleId: 'n1',
      nozzleName: 'N1',
      productId: 'p1',
      productName: 'Petrol',
      unit: 'L',
      unitPrice: 100,
      openingReading: 1000,
    },
    {
      nozzleId: 'n2',
      nozzleName: 'N2',
      productId: 'p1',
      productName: 'Petrol',
      unit: 'L',
      unitPrice: 90,
      openingReading: 500,
    },
  ],
  terminals: [],
  ...over,
});

const form = (d: AssignedDu, over: Partial<DuFormState> = {}): DuFormState => ({
  ...seedForm(d),
  ...over,
});

const line = (amount: number): CreditLine => ({
  customerId: null,
  customerName: null,
  vehicleId: null,
  productId: null,
  productName: null,
  quantity: null,
  unitPrice: null,
  amount,
  notes: null,
});
const price = (id: string) => ({ oil: 400, coolant: 250 })[id as 'oil'] ?? 0;

describe('readingsStep', () => {
  it('is done when every nozzle has a valid closing reading', () => {
    const d = du();
    const f = form(d, {
      readings: { n1: '1050', n2: '520' },
      confirmedReadings: { n1: true, n2: true },
      testing: { n1: '5', n2: '' },
    });
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

describe('readingsStep progress', () => {
  it('is not started while no closing reading has been entered or confirmed', () => {
    const d = du();
    // The seed fills closing = opening, which is valid but not yet an answer.
    expect(readingsStep(d, form(d)).status).toBe('not-started');
  });

  it('is in progress once some nozzles are entered', () => {
    const d = du();
    const f = form(d, { confirmedReadings: { n1: true, n2: false } });
    expect(readingsStep(d, f)).toEqual({
      status: 'in-progress',
      summary: '1 of 2 nozzles entered',
    });
  });

  it('counts a closing equal to its opening as done once confirmed', () => {
    const d = du();
    const f = form(d, { confirmedReadings: { n1: true, n2: true } });
    expect(readingsStep(d, f)).toEqual({ status: 'done', summary: 'N1, N2 · no litres yet' });
  });

  it('is done when the server already holds the closing readings', () => {
    const d = du({
      nozzles: du().nozzles.map((nz) => ({ ...nz, closingReading: nz.openingReading })),
    });
    expect(readingsStep(d, form(d)).status).toBe('done');
  });

  it('puts an error ahead of progress', () => {
    const d = du();
    const f = form(d, { readings: { n1: '900', n2: '500' }, confirmedReadings: { n1: true } });
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

describe('field errors', () => {
  const messages = (d: AssignedDu, f: DuFormState, aggregate = true) =>
    fieldErrorMap(
      [...readingsErrors(d, f), ...terminalErrors(d, f, aggregate), ...cashErrors(d, f)],
      d.duId,
    );

  it('names the input behind each reading and testing error', () => {
    const d = du();
    const f = form(d, {
      readings: { n1: '900', n2: '' },
      testing: { n1: '', n2: '' },
    });
    expect(messages(d, f)).toEqual({
      [fieldId.reading('n1')]: 'Cannot be below opening (1000)',
      [fieldId.reading('n2')]: 'Enter the closing reading',
    });
  });

  it('flags testing that exceeds the litres sold, with the unit', () => {
    const d = du();
    const f = form(d, { readings: { n1: '1010', n2: '500' }, testing: { n1: '50', n2: '-1' } });
    expect(messages(d, f)).toEqual({
      [fieldId.testing('n1')]: 'Cannot exceed 10.00 L',
      [fieldId.testing('n2')]: 'Cannot be negative',
    });
  });

  it('highlights a negative aggregate Card or UPI', () => {
    const d = du();
    const f = form(d, { aggregateCard: '-1', aggregateUpi: '-2' });
    expect(messages(d, f)).toEqual({
      [fieldId.aggregateCard]: 'No negatives',
      [fieldId.aggregateUpi]: 'No negatives',
    });
  });

  it('highlights the exact terminal field that is negative', () => {
    const d = du({
      terminals: [
        { terminalId: 't1', label: 'POS 1' },
        { terminalId: 't2', label: 'POS 2' },
      ],
    });
    const f = form(d, {
      terminals: {
        t1: { card: '', upi: '-5', batch: '' },
        t2: { card: '-3', upi: '', batch: '' },
      },
    });
    expect(messages(d, f, false)).toEqual({
      [fieldId.terminalUpi('t1')]: 'No negatives',
      [fieldId.terminalCard('t2')]: 'No negatives',
    });
  });

  it('highlights negative cash and drops', () => {
    const d = du();
    expect(messages(d, form(d, { cash: '-1', drops: '-2' }))).toEqual({
      [fieldId.cash]: 'No negatives',
      [fieldId.drops]: 'No negatives',
    });
  });

  it('only carries errors for the DU asked about', () => {
    const d = du();
    const errs = cashErrors(d, form(d, { cash: '-1' }));
    expect(fieldErrorMap(errs, 'other-du')).toEqual({});
  });

  it('agrees with the step status: a step errors exactly when it has a field error', () => {
    const d = du();
    const bad = form(d, { aggregateCard: '-1' });
    expect(terminalsStep(d, bad, true).status).toBe('error');
    expect(Object.keys(messages(d, bad))).toHaveLength(1);
    const ok = form(d);
    expect(terminalsStep(d, ok, true).status).not.toBe('error');
    expect(messages(d, ok)).toEqual({});
  });
});

describe('shared helpers', () => {
  it('nets testing off the metered litres and prices the DU', () => {
    const d = du();
    const f = form(d, { readings: { n1: '1050', n2: '520' }, testing: { n1: '10', n2: '' } });
    expect(nozzleNetVolume(d.nozzles[0], f)).toBe(40);
    expect(duFuelSales(d, f)).toBe(40 * 100 + 20 * 90);
  });

  it('sums card and UPI per terminal, or from the aggregate', () => {
    const t = du({ terminals: [{ terminalId: 't1', label: 'POS 1' }] });
    const f = form(t, { terminals: { t1: { card: '100', upi: '50', batch: '' } } });
    expect(declaredNonCash(t, f, false)).toEqual({ card: 100, upi: 50 });
    const d = du();
    expect(declaredNonCash(d, form(d, { aggregateCard: '7', aggregateUpi: '3' }), true)).toEqual({
      card: 7,
      upi: 3,
    });
    expect(declaredNonCash(d, form(d, { aggregateCard: '7' }), false)).toEqual({ card: 0, upi: 0 });
  });

  it('values merchandise lines at MRP', () => {
    expect(merchTotal([{ productId: 'oil', quantity: '2' }], price)).toBe(800);
  });
});

describe('reconcileDu', () => {
  it('is float + cash sales − drops, cash sales net of card, UPI and credit', () => {
    const d = du({ nozzles: [du().nozzles[0]] });
    // 50 L × ₹100 = ₹5,000 metered.
    const f = form(d, {
      readings: { n1: '1050' },
      aggregateCard: '1000',
      aggregateUpi: '500',
      drops: '500',
      cash: '4400',
    });
    const r = reconcileDu({
      du: d,
      form: f,
      credit: [line(700)],
      omc: [line(300)],
      merchCash: 400,
      aggregateNonCashAllowed: true,
    });
    expect(r).toMatchObject({
      openingFloat: 2000,
      cashSales: 2900,
      cashDrops: 500,
      expectedCash: 4400,
      expectedTotal: 5400,
      declaredTotal: 6900,
      varianceAmount: 0,
    });
  });
});

describe('nozzleGrossVolume', () => {
  it('is the litres metered past the opening reading, testing not yet taken off', () => {
    const d = du();
    const nz = d.nozzles[0];
    expect(
      nozzleGrossVolume(
        nz,
        form(d, { readings: { [nz.nozzleId]: '1050' }, testing: { [nz.nozzleId]: '5' } }),
      ),
    ).toBe(50);
    expect(
      nozzleNetVolume(
        nz,
        form(d, { readings: { [nz.nozzleId]: '1050' }, testing: { [nz.nozzleId]: '5' } }),
      ),
    ).toBe(45);
  });
  it('never goes below zero when the closing is behind the opening or blank', () => {
    const d = du();
    const nz = d.nozzles[0];
    expect(nozzleGrossVolume(nz, form(d, { readings: { [nz.nozzleId]: '10' } }))).toBe(0);
    expect(nozzleGrossVolume(nz, form(d, { readings: { [nz.nozzleId]: '' } }))).toBe(0);
  });
});

describe('merchandiseCash', () => {
  it('is gross at MRP less the typed card / UPI share', () => {
    expect(merchandiseCash(1000, '250')).toBe(750);
    expect(merchandiseCash(1000, '')).toBe(1000);
  });
  it('never goes below zero when more is declared non-cash than sold', () => {
    expect(merchandiseCash(100, '400')).toBe(0);
  });
});

describe('sumReconciliations', () => {
  it('sums each Drawer and rounds the variance to paise', () => {
    const total = sumReconciliations([
      { expectedTotal: 1000.1, declaredTotal: 990.2, varianceAmount: -9.9 },
      { expectedTotal: 500, declaredTotal: 500.1, varianceAmount: 0.1 },
    ]);
    expect(total.expectedTotal).toBeCloseTo(1500.1, 6);
    expect(total.declaredTotal).toBeCloseTo(1490.3, 6);
    expect(total.varianceAmount).toBe(-9.8);
  });
  it('counts a Drawer with no form as zero, and an empty list as all zeros', () => {
    expect(
      sumReconciliations([
        null,
        { expectedTotal: 5, declaredTotal: 5, varianceAmount: 0 },
        undefined,
      ]),
    ).toEqual({
      expectedTotal: 5,
      declaredTotal: 5,
      varianceAmount: 0,
    });
    expect(sumReconciliations([])).toEqual({
      expectedTotal: 0,
      declaredTotal: 0,
      varianceAmount: 0,
    });
  });
});
