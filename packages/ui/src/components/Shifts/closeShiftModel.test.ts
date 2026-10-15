import { describe, expect, it } from 'vitest';
import {
  EMPTY_CLOSE_DRAFT,
  closeDraftKey,
  closeDrawerRows,
  closeDrawerTotal,
  closeWarnings,
  dipCount,
  flaggedDrawers,
  hasCloseProgress,
  loadCloseDraft,
  parseCloseDraft,
  readingErrors,
  saveCloseDraft,
} from './closeShiftModel.js';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe('the close draft (#534)', () => {
  it('keeps what the operator typed across a reload, per station and shift', () => {
    const store = memory();
    const draft = {
      ...EMPTY_CLOSE_DRAFT,
      step: 'cash' as const,
      closingCash: 68_100,
      closeDrops: [{ drawerKey: 'u1|du1', amount: 500 }],
      recordDip: true,
      dipReadings: { tk1: 12_400 },
      dipReasons: { tk1: 'Morning dip' },
      cashBreakdown: { '500': 3 },
    };
    saveCloseDraft('st-1', 'sh-1', draft, store);
    expect(loadCloseDraft('st-1', 'sh-1', store)).toEqual(draft);
    expect(loadCloseDraft('st-1', 'sh-2', store)).toEqual(EMPTY_CLOSE_DRAFT);
    expect(store.m.has(closeDraftKey('st-1', 'sh-1'))).toBe(true);
  });

  it('stores nothing for an untouched draft, and clears on null', () => {
    const store = memory();
    saveCloseDraft('st-1', 'sh-1', EMPTY_CLOSE_DRAFT, store);
    expect(store.m.size).toBe(0);
    saveCloseDraft('st-1', 'sh-1', { ...EMPTY_CLOSE_DRAFT, closingCash: 10 }, store);
    saveCloseDraft('st-1', 'sh-1', null, store);
    expect(store.m.size).toBe(0);
  });

  it('reads a malformed draft as empty, field by field', () => {
    expect(parseCloseDraft('{oops')).toEqual(EMPTY_CLOSE_DRAFT);
    expect(parseCloseDraft('[1]')).toEqual(EMPTY_CLOSE_DRAFT);
    expect(
      parseCloseDraft(
        JSON.stringify({ step: 'done', closingCash: 'x', closeDrops: [{ amount: 5 }] }),
      ),
    ).toEqual({ ...EMPTY_CLOSE_DRAFT, closeDrops: [{ drawerKey: '', amount: 5 }] });
  });

  it('counts typed figures as progress, not the step alone', () => {
    expect(hasCloseProgress({ ...EMPTY_CLOSE_DRAFT, step: 'confirm' })).toBe(false);
    expect(hasCloseProgress({ ...EMPTY_CLOSE_DRAFT, closingCash: 1 })).toBe(true);
    expect(hasCloseProgress({ ...EMPTY_CLOSE_DRAFT, dipReadings: { a: '' } })).toBe(false);
    expect(hasCloseProgress({ ...EMPTY_CLOSE_DRAFT, dipReadings: { a: 0 } })).toBe(true);
    expect(dipCount({ dipReadings: { a: '', b: 0, c: 12 } })).toBe(2);
  });
});

const assignments = [
  { userId: 'u2', userName: 'Suresh', duId: 'du2', duCode: 'DU2' },
  { userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1' },
];
const drawer = (id: string, du: string, handed: number | null, variance: number | null) => ({
  attendantId: id,
  attendantName: id === 'u1' ? 'Ravi' : 'Suresh',
  duId: du,
  duName: du.toUpperCase(),
  openingFloat: 1000,
  cashSales: handed == null ? null : 3000,
  cashDrops: 200,
  closeCashDrops: 50,
  expectedCash: handed == null ? null : 3750,
  cashHandedOver: handed,
  variance,
});

describe('the Drawers table (#534)', () => {
  it('orders Drawers by dispenser, adds drops at close to the Handover drops', () => {
    const rows = closeDrawerRows({
      drawers: [drawer('u2', 'du2', null, null), drawer('u1', 'du1', 3750, 0)],
      assignments,
      handovers: [],
    });
    expect(rows.map((r) => r.label)).toEqual(['DU1 · Ravi', 'DU2 · Suresh']);
    expect(rows[0]).toMatchObject({ pending: false, drops: 250, expected: 3750, variance: 0 });
    expect(rows[1]).toMatchObject({ pending: true, declared: null, variance: null });
    expect(rows[1].assignment?.userId).toBe('u2');
  });

  it('totals the handed-over Drawers and says which it leaves out', () => {
    const rows = closeDrawerRows({
      drawers: [drawer('u2', 'du2', null, null), drawer('u1', 'du1', 3870, 120)],
      assignments,
      handovers: [],
    });
    const t = closeDrawerTotal(rows);
    expect(t.label).toBe('Total excl. DU2, not handed over');
    expect(t.values).toMatchObject({ openingFloat: 1000, declared: 3870 });
    expect(t.variance).toBe(120);
    expect(flaggedDrawers(rows).map((r) => r.du)).toEqual(['DU1']);
  });

  it('falls back to the Handovers when the server lists no Drawers', () => {
    const rows = closeDrawerRows({
      drawers: [],
      assignments,
      handovers: [{ userId: 'u1', duId: 'du1', cashHandedOver: '4000', varianceAmount: '-340.5' }],
    });
    expect(rows[0]).toMatchObject({ declared: 4000, variance: -340.5, openingFloat: null });
    const t = closeDrawerTotal(rows);
    expect(t.values.openingFloat).toBeNull();
    expect(t.variance).toBe(-340.5);
  });
});

const readings = [
  { nozzleId: 'n1', nozzleName: 'N1', unit: 'L', openingReading: '100' },
  { nozzleId: 'n2', nozzleName: 'N2', unit: 'L', openingReading: '200' },
];
const inr = (v: number) => `₹${v}`;

describe('close readings and warnings, in the old wizard’s words', () => {
  it('refuses a closing reading below its opening', () => {
    expect(readingErrors(readings, { n1: 99, n2: 200 })).toEqual([
      'Closing reading for nozzle N1 (99) cannot be less than opening reading (100)',
    ]);
    expect(readingErrors(readings, {})).toEqual([]);
  });

  const base = {
    readings,
    closing: { n1: 150, n2: 200 },
    assignments: [{ userId: 'u1', userName: 'Ravi', duId: 'du1', duName: 'DU1' }],
    handovers: [{ userId: 'u1', duId: 'du1', creditHandedOver: '0' }],
    creditSales: 0,
    closingCash: 1000,
    expectedCash: 1000,
    formatMoney: inr,
  };

  it('has nothing to say about a clean close', () => {
    expect(closeWarnings(base)).toEqual([]);
  });

  it('words each warning as before', () => {
    const w = closeWarnings({
      ...base,
      closing: { n1: 100, n2: 200 },
      assignments: [
        ...base.assignments,
        { userId: 'u2', userName: 'Suresh', duId: 'du2', duName: 'DU2' },
      ],
      handovers: [{ userId: 'u1', duId: 'du1', creditHandedOver: '500' }],
      closingCash: 0,
    });
    expect(w).toEqual([
      'Zero fuel volume was sold across all nozzles during this shift.',
      'Handover not recorded for attendant Suresh on dispenser DU2.',
      'Credit Sales mismatch: Attendants declared ₹500 in chits, but only ₹0 of detailed customer billing has been logged in the transaction panel.',
      'Closing cash is ₹0, indicating no collections entered.',
      'Cash discrepancy detected! Variance is ₹-1000 (Expected: ₹1000, Entered: ₹0)',
    ]);
  });

  it('flags high volume and a count beyond ₹100 only', () => {
    const w = closeWarnings({ ...base, closing: { n1: 5200, n2: 200 }, closingCash: 1100 });
    expect(w).toEqual(['High volume alert: Nozzle N1 sold 5100.00 L.']);
    expect(closeWarnings({ ...base, closingCash: 1100.01 })).toHaveLength(1);
  });
});
