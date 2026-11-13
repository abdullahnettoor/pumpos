import type {
  DebtorBill,
  DebtorBucket,
  DebtorDetail,
  DebtorLine,
  DebtorsAgeingData,
  DueWindow,
} from '../debtorsAgeingDoc.js';
import { CUSTOMERS, r2, rng } from './common.js';
import { OCT_SHIFTS } from './month.js';

/*
 * Receivables on 31 Oct 2026, built the way the report will build them: the
 * credit sales come first, then dated collections settle the oldest bill
 * first (FIFO), and each Customer's line is derived from what is left.
 */

export const AS_OF = '2026-10-31';

const toDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) => toDay(to) - toDay(from);
export const bucketOf = (days: number): DebtorBucket =>
  days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+';

export interface CreditSale {
  customer: string;
  date: string;
  /** Shift of that Business Date: 1 (morning) or 2 (evening). */
  shift: 1 | 2;
  docNo: string;
  vehicle: string;
  amount: number;
}
export interface CustomerCollection {
  customer: string;
  date: string;
  amount: number;
  method: 'NEFT' | 'Cash' | 'UPI' | 'Cheque';
  account: string;
}

/** Per Customer: bill cadence, age span and how far collections have caught up. */
const PLAN: Record<
  string,
  {
    every: number;
    span: number;
    min: number;
    max: number;
    keep: number;
    credit: number;
    vehicles: string[];
  }
> = {
  'Kochi Metro Logistics': {
    every: 2,
    span: 92,
    min: 6500,
    max: 14500,
    keep: 38,
    credit: 30,
    vehicles: ['KL-07-CU-4417', 'KL-07-CT-9082', 'KL-07-DB-1265', 'KL-07-CX-3350'],
  },
  'Periyar Travels': {
    every: 3,
    span: 90,
    min: 4200,
    max: 9200,
    keep: 58,
    credit: 30,
    vehicles: ['KL-07-BV-2210', 'KL-07-CA-7741', 'KL-07-BZ-0496'],
  },
  'St. Mary’s School (bus)': {
    every: 7,
    span: 120,
    min: 8000,
    max: 14000,
    keep: 44,
    credit: 30,
    vehicles: ['KL-07-AT-5521', 'KL-07-AT-5522'],
  },
  'Malabar Constructions': {
    every: 6,
    span: 150,
    min: 7800,
    max: 14200,
    keep: 122,
    credit: 15,
    vehicles: ['KL-07-CK-6610', 'KL-07-BN-3188', 'KL-41-H-2207'],
  },
  'City Taxi Union': {
    every: 2,
    span: 50,
    min: 1500,
    max: 3600,
    keep: 24,
    credit: 15,
    vehicles: ['KL-07-CF-1102', 'KL-07-CG-8834', 'KL-07-BW-4471'],
  },
  'Green Valley Farms': {
    every: 10,
    span: 110,
    min: 3200,
    max: 7200,
    keep: 72,
    credit: 15,
    vehicles: ['KL-07-AQ-6090'],
  },
  'Joseph Mathew': {
    every: 5,
    span: 90,
    min: 2000,
    max: 4200,
    keep: 62,
    credit: 15,
    vehicles: ['KL-07-CR-7716'],
  },
};

export const CREDIT_DAYS: Record<string, number> = Object.fromEntries(
  Object.entries(PLAN).map(([k, p]) => [k, p.credit]),
);

/** The Day Book date: its Shifts' credit sales add up to the month's credit by Shift. */
export const DAY_BOOK_DATE = '2026-10-15';

/** Office collections of the Day Book date (Entry Date), so the Day Book and the ledgers agree. */
const DAY_BOOK_COLLECTIONS: CustomerCollection[] = [
  {
    customer: 'Periyar Travels',
    date: DAY_BOOK_DATE,
    amount: 40000,
    method: 'NEFT',
    account: 'HDFC Bank ••4417',
  },
  {
    customer: 'City Taxi Union',
    date: DAY_BOOK_DATE,
    amount: 6000,
    method: 'Cash',
    account: 'Cash in Hand',
  },
];

/** Tops up each Shift of the Day Book date with credit sales up to that Shift's credit total. */
function dayBookCredit(
  raw: Omit<CreditSale, 'docNo'>[],
  r: ReturnType<typeof rng>,
): Omit<CreditSale, 'docNo'>[] {
  const extra: Omit<CreditSale, 'docNo'>[] = [];
  const takers: Record<1 | 2, string[]> = {
    1: ['Periyar Travels', 'St. Mary’s School (bus)', 'City Taxi Union'],
    2: ['St. Mary’s School (bus)', 'Periyar Travels', 'Green Valley Farms'],
  };
  for (const shift of [1, 2] as const) {
    const s = OCT_SHIFTS.find((x) => x.date === DAY_BOOK_DATE && x.seq === shift)!;
    const have = raw
      .filter((b) => b.date === DAY_BOOK_DATE && b.shift === shift)
      .reduce((a, b) => a + b.amount, 0);
    let left = r2(s.modes.credit - have);
    takers[shift].forEach((customer, i) => {
      const last = i === takers[shift].length - 1;
      const amount = last
        ? left
        : r2(Math.round((left * (i === 0 ? 0.45 : 0.55)) / 10) * 10 + 0.48);
      left = r2(left - amount);
      extra.push({
        customer,
        date: DAY_BOOK_DATE,
        shift,
        vehicle: r.pick(PLAN[customer].vehicles),
        amount,
      });
    });
  }
  return extra;
}

function build() {
  const r = rng(20261031);
  const raw: Omit<CreditSale, 'docNo'>[] = [];
  const collections: CustomerCollection[] = [];
  for (const c of CUSTOMERS) {
    const p = PLAN[c.name];
    const mine: Omit<CreditSale, 'docNo'>[] = [];
    for (let back = p.span; back >= 0; back -= p.every) {
      if (r.next() < 0.12) continue;
      const date = addDays(AS_OF, -back - r.int(0, 1));
      mine.push({
        customer: c.name,
        date,
        shift: (toDay(date) + mine.length) % 2 === 0 ? 1 : 2,
        vehicle: r.pick(p.vehicles),
        amount: r2(Math.round(r.between(p.min, p.max) / 10) * 10 + r.pick([0, 0.48, 0.96, 0.2])),
      });
    }
    raw.push(...mine);
    // Collections catch up to every bill older than `keep` days, plus part of the next one.
    const settled = mine.filter((b) => daysBetween(b.date, AS_OF) > p.keep);
    const next = mine.find((b) => daysBetween(b.date, AS_OF) <= p.keep);
    const total =
      Math.floor(
        (settled.reduce((a, b) => a + b.amount, 0) + (next ? next.amount * 0.4 : 0)) / 100,
      ) * 100;
    // Paid in instalments; the last lands a few weeks after the bills it clears.
    const n = Math.max(2, Math.round((p.span - p.keep) / 16));
    const gap = Math.max(1, Math.floor((p.span - p.keep - 10) / n));
    const first = addDays(AS_OF, -Math.max(3, p.keep - 20) - (n - 1) * gap);
    let left = total;
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? left : Math.round(total / n / 500) * 500;
      left = r2(left - amount);
      const method = c.type === 'Fleet' ? 'NEFT' : r.pick(['Cash', 'UPI', 'Cheque'] as const);
      collections.push({
        customer: c.name,
        date: addDays(first, i * gap),
        amount,
        method,
        account: method === 'Cash' ? 'Cash in Hand' : 'HDFC Bank ••4417',
      });
    }
  }
  raw.push(...dayBookCredit(raw, r));
  collections.push(...DAY_BOOK_COLLECTIONS);
  raw.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.shift - b.shift || a.customer.localeCompare(b.customer),
  );
  let doc = 2860;
  const sales: CreditSale[] = raw.map((b) => {
    doc += 14 + Math.floor((toDay(b.date) % 7) * 3);
    return { ...b, docNo: `SAL-${String(doc).padStart(6, '0')}` };
  });
  collections.sort((a, b) => a.date.localeCompare(b.date));
  return { sales, collections };
}

const built = build();
export const CREDIT_SALES: CreditSale[] = built.sales;
export const COLLECTIONS: CustomerCollection[] = built.collections;

/** Settle a Customer's bills oldest first with everything collected up to `asOf`. */
export function openBills(customer: string, asOf = AS_OF): DebtorBill[] {
  const bills = CREDIT_SALES.filter((b) => b.customer === customer && b.date <= asOf);
  let pool = r2(
    COLLECTIONS.filter((c) => c.customer === customer && c.date <= asOf).reduce(
      (a, c) => a + c.amount,
      0,
    ),
  );
  const out: DebtorBill[] = [];
  for (const b of bills) {
    const received = r2(Math.min(pool, b.amount));
    pool = r2(pool - received);
    const balance = r2(b.amount - received);
    if (balance <= 0) continue;
    const days = daysBetween(b.date, asOf);
    out.push({
      date: b.date,
      docNo: b.docNo,
      vehicle: b.vehicle,
      amount: b.amount,
      received,
      balance,
      days,
      bucket: bucketOf(days),
    });
  }
  return out;
}

const lines: DebtorLine[] = CUSTOMERS.map((c) => {
  const bills = openBills(c.name);
  const bucket = (k: DebtorBucket) =>
    r2(bills.filter((b) => b.bucket === k).reduce((a, b) => a + b.balance, 0));
  return {
    customer: c.name,
    phone: c.phone,
    type: c.type as DebtorLine['type'],
    limit: c.limit,
    balance: r2(bills.reduce((a, b) => a + b.balance, 0)),
    buckets: {
      '0–30': bucket('0–30'),
      '31–60': bucket('31–60'),
      '61–90': bucket('61–90'),
      '90+': bucket('90+'),
    },
  };
});

const DETAIL = ['Malabar Constructions', 'Joseph Mathew'];
const detail: DebtorDetail[] = DETAIL.map((name) => ({
  customer: name,
  type: CUSTOMERS.find((c) => c.name === name)!.type,
  creditDays: CREDIT_DAYS[name],
  bills: openBills(name),
}));

/** Every open bill's due date (sale date + credit days) against the As-of date. */
function dueWindows(): DueWindow[] {
  const all = CUSTOMERS.flatMap((c) =>
    openBills(c.name).map((b) => ({
      ...b,
      inDays: daysBetween(AS_OF, addDays(b.date, CREDIT_DAYS[c.name])),
    })),
  );
  const win = (label: string, test: (d: number) => boolean): DueWindow => {
    const xs = all.filter((b) => test(b.inDays));
    return { label, bills: xs.length, amount: r2(xs.reduce((a, b) => a + b.balance, 0)) };
  };
  return [
    win('Overdue', (d) => d <= 0),
    win('Next 7 days (01–07 Nov)', (d) => d >= 1 && d <= 7),
    win('8–15 days (08–15 Nov)', (d) => d >= 8 && d <= 15),
    win('16–30 days (16–30 Nov)', (d) => d >= 16 && d <= 30),
  ];
}

export const DEBTORS_AGEING_SAMPLE: DebtorsAgeingData = {
  asOf: AS_OF,
  filters: { customer: 'All', customerType: 'All', bucket: 'All', overLimitOnly: 'No' },
  lines,
  detail,
  due: dueWindows(),
};
