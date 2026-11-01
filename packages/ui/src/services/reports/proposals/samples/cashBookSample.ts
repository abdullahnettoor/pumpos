import type { CashBookData, CashBookEntry, CashBookSummaryDay } from '../cashBookDoc.js';
import { CUSTOMERS, OCT_DAYS, PERIOD, SUPPLIERS, r2, rng } from './common.js';
import { OCT_SHIFTS } from './month.js';

/*
 * One month of Cash in Hand: each Shift's close cash (from OCT_SHIFTS, so it
 * agrees with the Shift Cash Variance report), cash Collections, cash Expenses,
 * Income, Supplier Payments and transfers out to Bank and Petty Cash.
 */

const OPENING = 46820;
const DETAIL_DAYS = ['2026-10-14', '2026-10-15', '2026-10-16'];

const r = rng(20261005);
const seq = { exp: 118, inc: 24, spy: 11, trf: 207, col: 398 };
const no = (prefix: string, n: number, width = 4) => `${prefix}-${String(n).padStart(width, '0')}`;

const SNACKS = [
  'Tea & snacks — forecourt staff',
  'Tea & snacks — staff',
  'Drinking water cans (20 L × 4)',
];
const SUNDRY = [
  { text: 'Housekeeping — cleaning supplies', min: 450, max: 1200 },
  { text: 'Courier — IOCL documents', min: 120, max: 260 },
  { text: 'Stationery — DSR register, carbon', min: 180, max: 540 },
  { text: 'Plumber — washroom tap', min: 600, max: 1400 },
];
const CASH_CUSTOMERS = CUSTOMERS.filter((c) => c.type === 'Credit').map((c) => c.name);

/** Cash the office receives at a Shift close: counted + Cash Drops − Opening Floats. */
function shiftCloseEntries(date: string): CashBookEntry[] {
  return OCT_SHIFTS.filter((s) => s.date === date).map((s) => {
    const drops = r2(s.drawers.reduce((a, d) => a + d.cashDrops, 0));
    const floats = r2(s.drawers.reduce((a, d) => a + d.openingFloat, 0));
    return {
      date,
      voucher: s.label,
      type: 'Shift close' as const,
      particulars: `Shift ${s.label} close — cash received`,
      shiftCash: { counted: s.officeCounted, drops, floats },
      receipt: r2(s.officeCounted + drops - floats),
      payment: 0,
    };
  });
}

function build(): CashBookEntry[] {
  const out: CashBookEntry[] = [];
  let balance = OPENING;
  const push = (e: CashBookEntry) => {
    out.push(e);
    balance = r2(balance + e.receipt - e.payment);
  };
  OCT_DAYS.forEach((date, di) => {
    const day = di + 1;
    const pay = (
      type: CashBookEntry['type'],
      voucher: string,
      particulars: string,
      amount: number,
      detail?: string,
    ) => push({ date, voucher, type, particulars, detail, receipt: 0, payment: amount });
    const take = (
      type: CashBookEntry['type'],
      voucher: string,
      particulars: string,
      amount: number,
      detail?: string,
    ) => push({ date, voucher, type, particulars, detail, receipt: amount, payment: 0 });

    if (day > 1) {
      const deposit = Math.floor((balance - r.int(32, 48) * 1000) / 1000) * 1000;
      pay(
        'Transfer',
        no('TRF', seq.trf++),
        'Transfer to Bank — cash deposit, SBI ****4471',
        deposit,
      );
    }
    pay('Expense', no('EXP', seq.exp++), r.pick(SNACKS), r2(r.int(18, 42) * 10));
    if (date === '2026-10-15') {
      pay('Expense', no('EXP', seq.exp++), 'Electrician — DU-2 canopy light repair', 1850);
    } else if (r.next() < 0.3) {
      const s = r.pick(SUNDRY);
      pay('Expense', no('EXP', seq.exp++), s.text, r2(r.int(s.min / 10, s.max / 10) * 10));
    }
    if (DETAIL_DAYS.includes(date) || r.next() < 0.45) {
      take(
        'Collection',
        no('COL', seq.col++, 6),
        `Collection — ${r.pick(CASH_CUSTOMERS)}`,
        r2(r.int(5, 25) * 1000),
      );
    }
    const [first, second] = shiftCloseEntries(date);
    push(first);
    if (day % 7 === 1) {
      pay('Transfer', no('TRF', seq.trf++), 'Transfer to Petty Cash — weekly top-up', 5000);
    }
    if (date === '2026-10-16' || (day % 9 === 4 && date !== '2026-10-14')) {
      const supplier = day % 2 === 0 ? SUPPLIERS[2].name : SUPPLIERS[1].name;
      pay(
        'Supplier payment',
        no('SPY', seq.spy++),
        `Supplier payment — ${supplier}`,
        r2(r.int(28, 64) * 150),
      );
    }
    if (date === '2026-10-14' || day % 11 === 3) {
      take(
        'Income',
        no('INC', seq.inc++),
        'Scrap sale — empty oil cans & drums',
        r2(r.int(9, 18) * 100),
      );
    }
    push(second);
  });
  return out;
}

const entries = build();

const summary: CashBookSummaryDay[] = [];
OCT_DAYS.reduce((opening, date) => {
  const day = entries.filter((e) => e.date === date);
  const receipts = r2(day.reduce((a, e) => a + e.receipt, 0));
  const payments = r2(day.reduce((a, e) => a + e.payment, 0));
  const closing = r2(opening + receipts - payments);
  summary.push({ date, opening, receipts, payments, closing });
  return closing;
}, OPENING);

export const CASH_BOOK_SAMPLE: CashBookData = {
  account: { name: 'Cash in Hand', code: 'CASH_IN_HAND' },
  filters: {
    period: PERIOD,
    detailPeriod: '14–16 Oct 2026',
    entryType: 'All',
    voucherType: 'All',
  },
  detail: DETAIL_DAYS.map((date) => ({
    date,
    opening: summary.find((d) => d.date === date)!.opening,
    entries: entries.filter((e) => e.date === date),
  })),
  summary,
};
