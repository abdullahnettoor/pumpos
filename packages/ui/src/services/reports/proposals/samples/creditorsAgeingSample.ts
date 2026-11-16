import type {
  CreditorBill,
  CreditorBucket,
  CreditorDetail,
  CreditorLine,
  CreditorMovement,
  CreditorsAgeingData,
  PayableDueWindow,
} from '../creditorsAgeingDoc.js';
import { FUELS, SUPPLIERS, r2, rng } from './common.js';
import { AS_OF, addDays, bucketOf, daysBetween } from './debtorsAgeingSample.js';

/*
 * Payables on 31 Oct 2026, built as the report will build them: this
 * Station's purchases first, then its dated supplier payments settle the
 * oldest bill first (FIFO). IndianOil is paid ahead of every indent, so it
 * carries an advance, never a negative payable.
 */

export interface Purchase {
  supplier: string;
  date: string;
  billNo: string;
  kind: 'Fuel' | 'Product';
  amount: number;
}
export interface Payment {
  supplier: string;
  date: string;
  amount: number;
}

const ALL_SUPPLIERS = [
  ...SUPPLIERS,
  { name: 'Edappally Battery Centre', gstin: '32AGWPV7731K1ZQ' },
  { name: 'Cochin Lab & Safety Supplies', gstin: '32AAKFC2290L1Z5' },
];

interface Plan {
  kind: 'Fuel' | 'Product';
  every: number;
  span: number;
  min: number;
  max: number;
  /** Payments catch up to bills older than this many days (plus part of the next). */
  keep: number;
  /** Group-B credit days; null for a prepaid supplier. */
  credit: number | null;
  bill: (n: number) => string;
}

const PLAN: Record<string, Plan> = {
  'Indian Oil Corporation Ltd': {
    kind: 'Fuel',
    every: 2,
    span: 76,
    min: 1120000,
    max: 1680000,
    keep: -1,
    credit: null,
    bill: (n) => `9100${452100 + n * 7}`,
  },
  'Servo Lubes Distributors': {
    kind: 'Product',
    every: 10,
    span: 130,
    min: 42000,
    max: 118000,
    keep: 52,
    credit: 30,
    bill: (n) => `SLD/26-27/${String(312 + n * 4).padStart(4, '0')}`,
  },
  'Kerala Auto Accessories': {
    kind: 'Product',
    every: 20,
    span: 125,
    min: 8000,
    max: 24500,
    keep: 104,
    credit: 45,
    bill: (n) => `KAA-${2240 + n * 3}`,
  },
  'Edappally Battery Centre': {
    kind: 'Product',
    every: 30,
    span: 106,
    min: 6200,
    max: 14200,
    keep: 24,
    credit: 30,
    bill: (n) => `EBC/${1180 + n}`,
  },
  'Cochin Lab & Safety Supplies': {
    kind: 'Product',
    every: 35,
    span: 130,
    min: 4200,
    max: 9100,
    keep: 100,
    credit: 15,
    bill: (n) => `CLS-26-${String(331 + n * 9).padStart(4, '0')}`,
  },
};

const IOCL_ADVANCE = 185000;

/** The Day Book date's IndianOil load, decanted that day: its invoice is litres × dealer cost. */
export const DAY_BOOK_LOAD = { date: '2026-10-15', petrolL: 6000, dieselL: 8000 };
const dayBookLoadValue = r2(
  DAY_BOOK_LOAD.petrolL * FUELS[0].cost + DAY_BOOK_LOAD.dieselL * FUELS[1].cost,
);

function build() {
  const r = rng(20261030);
  const purchases: Purchase[] = [];
  const payments: Payment[] = [];
  for (const s of ALL_SUPPLIERS) {
    const p = PLAN[s.name];
    const mine: Purchase[] = [];
    let n = 0;
    for (let back = p.span; back >= 0; back -= p.every) {
      const amount =
        p.kind === 'Fuel'
          ? r2(Math.round(r.between(p.min, p.max)) + r.pick([0.18, 0.64, 0.42]))
          : r2(Math.round(r.between(p.min, p.max) / 10) * 10 + r.pick([0, 0.5, 0.82]));
      const date = addDays(AS_OF, -back);
      const load = p.kind === 'Fuel' && date === DAY_BOOK_LOAD.date;
      mine.push({
        supplier: s.name,
        date,
        billNo: p.bill(n++),
        kind: p.kind,
        amount: load ? dayBookLoadValue : amount,
      });
    }
    purchases.push(...mine);
    if (p.kind === 'Fuel') {
      // Each indent is paid on its invoice date, rounded up; the last transfer leaves the advance.
      let paid = 0;
      mine.forEach((b, i) => {
        const amount =
          i === mine.length - 1
            ? r2(mine.reduce((a, x) => a + x.amount, 0) + IOCL_ADVANCE - paid)
            : Math.ceil(b.amount / 10000) * 10000;
        paid = r2(paid + amount);
        payments.push({ supplier: s.name, date: b.date, amount });
      });
      continue;
    }
    const settled = mine.filter((b) => daysBetween(b.date, AS_OF) > p.keep);
    const next = mine.find((b) => daysBetween(b.date, AS_OF) <= p.keep);
    const total =
      Math.floor(
        (settled.reduce((a, b) => a + b.amount, 0) + (next ? next.amount * 0.35 : 0)) / 100,
      ) * 100;
    if (!total) continue;
    const count = Math.max(1, Math.round((p.span - p.keep) / 25));
    const gap = Math.max(1, Math.floor((p.span - p.keep) / count));
    // The last payment lands a few weeks after the bills it clears; the rest spaced before it.
    const last = -Math.max(3, p.keep - 25);
    let left = total;
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? left : Math.round(total / count / 1000) * 1000;
      left = r2(left - amount);
      payments.push({
        supplier: s.name,
        date: addDays(AS_OF, last - (count - 1 - i) * gap),
        amount,
      });
    }
  }
  return { purchases, payments };
}

const built = build();
export const PURCHASES: Purchase[] = built.purchases;
export const PAYMENTS: Payment[] = built.payments;

function unpaid(supplier: string): CreditorBill[] {
  let pool = r2(PAYMENTS.filter((p) => p.supplier === supplier).reduce((a, p) => a + p.amount, 0));
  const out: CreditorBill[] = [];
  for (const b of PURCHASES.filter((p) => p.supplier === supplier)) {
    const paid = r2(Math.min(pool, b.amount));
    pool = r2(pool - paid);
    const balance = r2(b.amount - paid);
    if (balance <= 0) continue;
    const days = daysBetween(b.date, AS_OF);
    out.push({
      date: b.date,
      billNo: b.billNo,
      kind: b.kind,
      amount: b.amount,
      paid,
      balance,
      days,
      bucket: bucketOf(days),
    });
  }
  return out;
}

const ledgerBalance = (supplier: string, before = '9999-12-31') =>
  r2(
    PURCHASES.filter((p) => p.supplier === supplier && p.date < before).reduce(
      (a, p) => a + p.amount,
      0,
    ) -
      PAYMENTS.filter((p) => p.supplier === supplier && p.date < before).reduce(
        (a, p) => a + p.amount,
        0,
      ),
  );

const lines: CreditorLine[] = ALL_SUPPLIERS.map((s) => {
  const bills = unpaid(s.name);
  const bucket = (k: CreditorBucket) =>
    r2(bills.filter((b) => b.bucket === k).reduce((a, b) => a + b.balance, 0));
  return {
    supplier: s.name,
    gstin: s.gstin,
    balance: ledgerBalance(s.name),
    buckets: {
      '0–30': bucket('0–30'),
      '31–60': bucket('31–60'),
      '61–90': bucket('61–90'),
      '90+': bucket('90+'),
    },
    oldestUnpaid: bills[0]?.date ?? null,
  };
});

const DETAIL = [
  'Indian Oil Corporation Ltd',
  'Servo Lubes Distributors',
  'Kerala Auto Accessories',
];
const detail: CreditorDetail[] = DETAIL.map((name) => ({
  supplier: name,
  creditDays: PLAN[name].credit,
  bills: unpaid(name),
  advance: Math.max(0, -ledgerBalance(name)),
}));

const MONTH_START = '2026-10-01';
const movement: CreditorMovement[] = ALL_SUPPLIERS.map((s) => {
  const inMonth = <T extends { supplier: string; date: string; amount: number }>(xs: T[]) =>
    r2(
      xs
        .filter((x) => x.supplier === s.name && x.date >= MONTH_START && x.date <= AS_OF)
        .reduce((a, x) => a + x.amount, 0),
    );
  return {
    supplier: s.name,
    opening: ledgerBalance(s.name, MONTH_START),
    purchases: inMonth(PURCHASES),
    payments: inMonth(PAYMENTS),
  };
});

function dueWindows(): PayableDueWindow[] {
  const all = ALL_SUPPLIERS.flatMap((s) =>
    unpaid(s.name).map((b) => ({
      ...b,
      inDays: daysBetween(AS_OF, addDays(b.date, PLAN[s.name].credit ?? 0)),
    })),
  );
  const win = (label: string, test: (d: number) => boolean): PayableDueWindow => {
    const xs = all.filter((b) => test(b.inDays));
    return { label, bills: xs.length, amount: r2(xs.reduce((a, b) => a + b.balance, 0)) };
  };
  return [
    win('Overdue', (d) => d <= 0),
    win('Next 7 days (01–07 Nov)', (d) => d >= 1 && d <= 7),
    win('8–15 days (08–15 Nov)', (d) => d >= 8 && d <= 15),
    win('16–30 days (16–30 Nov)', (d) => d >= 16 && d <= 30),
    win('Later than 30 days', (d) => d > 30),
  ];
}

export const CREDITORS_AGEING_SAMPLE: CreditorsAgeingData = {
  asOf: AS_OF,
  monthLabel: 'Oct 2026',
  movement,
  filters: { supplier: 'All', purchaseType: 'All', bucket: 'All' },
  lines,
  detail,
  due: dueWindows(),
};
