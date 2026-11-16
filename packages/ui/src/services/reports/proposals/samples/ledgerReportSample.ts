import type { LedgerReportData, LedgerReportRow, LedgerSection } from '../ledgerReportDoc.js';
import { r2, shiftLabel } from './common.js';
import { dShort } from '../shared.js';
import { OCT_SHIFTS } from './month.js';
import { COLLECTIONS, CREDIT_SALES, addDays } from './debtorsAgeingSample.js';
import { PAYMENTS, PURCHASES } from './creditorsAgeingSample.js';

/*
 * Three example ledgers. The bank account is fed by the month's Shifts (cash
 * deposited, card / UPI settled), the fleet collections of the debtors sample
 * and the IndianOil payments of the creditors sample; the customer ledger is
 * the debtors sample's Kochi Metro Logistics, so its closing equals that
 * customer's receivable there.
 */

const BANK = 'HDFC Bank ••4417';
const KSEB_BILL = { date: '2026-10-06', amount: 41862, voucher: 'EXP-000418' };
const BANK_FROM = '2026-10-01';
const BANK_TO = '2026-10-07';

const seq = (prefix: string, start: number) => {
  let n = start;
  return () => `${prefix}-${String(n++).padStart(6, '0')}`;
};

function bankRows(): LedgerReportRow[] {
  const trf = seq('TRF', 2184);
  const stl = seq('STL', 1406);
  const spy = seq('SPY', 731);
  const out: (LedgerReportRow & { order: number })[] = [];
  for (let d = BANK_FROM; d <= BANK_TO; d = addDays(d, 1)) {
    const prev = addDays(d, -1);
    const shifts = OCT_SHIFTS.filter((s) => s.date === prev);
    const cash = shifts.length ? shifts.reduce((a, s) => a + s.modes.cash, 0) : 318540;
    const card = shifts.length ? shifts.reduce((a, s) => a + s.modes.card, 0) : 92310.4;
    const upi = shifts.length ? shifts.reduce((a, s) => a + s.modes.upi, 0) : 201744.6;
    const mdr = r2(card * 0.009);
    out.push({
      order: 0,
      date: d,
      voucherNo: trf(),
      particulars: `Transfer · Cash in Hand → Bank · cash of ${dShort(prev)}`,
      debit: Math.floor(cash / 1000) * 1000,
      credit: null,
    });
    out.push({
      order: 1,
      date: d,
      voucherNo: stl(),
      particulars: 'Settlement · Merchant Clearing → Bank',
      detail: `Card + UPI of ${dShort(prev)}, net of MDR ₹${mdr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      debit: r2(card + upi - mdr),
      credit: null,
    });
  }
  COLLECTIONS.filter((c) => c.account === BANK && c.date >= BANK_FROM && c.date <= BANK_TO).forEach(
    (c, i) =>
      out.push({
        order: 2,
        date: c.date,
        voucherNo: `COL-${String(512 + i).padStart(6, '0')}`,
        particulars: `Collection · ${c.customer}`,
        detail: c.method,
        debit: c.amount,
        credit: null,
      }),
  );
  PAYMENTS.filter(
    (p) => p.supplier === 'Indian Oil Corporation Ltd' && p.date >= BANK_FROM && p.date <= BANK_TO,
  ).forEach((p) => {
    const inv = PURCHASES.find((x) => x.supplier === p.supplier && x.date === p.date);
    out.push({
      order: 3,
      date: p.date,
      voucherNo: spy(),
      particulars: 'Supplier payment · Indian Oil Corporation Ltd',
      detail: `RTGS · indent, invoice ${inv?.billNo ?? ''}`,
      debit: null,
      credit: p.amount,
    });
  });
  out.push({
    order: 4,
    date: KSEB_BILL.date,
    voucherNo: KSEB_BILL.voucher,
    particulars: 'Expense · Electricity',
    detail: 'KSEB LT-VII bill Aug–Sep · NEFT',
    debit: null,
    credit: KSEB_BILL.amount,
  });
  return out
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
    .map(({ order: _order, ...r }) => r);
}

const bank: LedgerSection = {
  kind: 'Account',
  name: 'HDFC Bank — Current A/c ••4417',
  descriptor: 'Financial Account · Bank',
  period: '01–07 Oct 2026',
  columns: { debit: 'In', credit: 'Out', balance: 'Balance' },
  raisedBy: 'debit',
  caption: 'In raises the balance, Out lowers it.',
  openingLabel: 'Opening balance',
  opening: 1842615.3,
  rows: bankRows(),
};

const CUSTOMER = 'Kochi Metro Logistics';
const MONTH_FROM = '2026-10-01';
const MONTH_TO = '2026-10-31';

function customerSection(): LedgerSection {
  const before = (d: string) => d < MONTH_FROM;
  const inMonth = (d: string) => d >= MONTH_FROM && d <= MONTH_TO;
  const sales = CREDIT_SALES.filter((b) => b.customer === CUSTOMER);
  const cols = COLLECTIONS.filter((c) => c.customer === CUSTOMER);
  const opening = r2(
    sales.filter((b) => before(b.date)).reduce((a, b) => a + b.amount, 0) -
      cols.filter((c) => before(c.date)).reduce((a, c) => a + c.amount, 0),
  );
  const rows = [
    ...sales
      .filter((b) => inMonth(b.date))
      .map((b) => ({
        order: 0,
        date: b.date,
        voucherNo: b.docNo,
        particulars: 'Credit sale · Diesel',
        detail: `${b.vehicle} · shift ${shiftLabel(b.date, b.shift)}`,
        debit: b.amount,
        credit: null,
      })),
    ...cols
      .filter((c) => inMonth(c.date))
      .map((c, i) => ({
        order: 1,
        date: c.date,
        voucherNo: `COL-${String(530 + i * 7).padStart(6, '0')}`,
        particulars: `Collection · ${c.method}`,
        detail: `Funding account: ${c.account}`,
        debit: null,
        credit: c.amount,
      })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
    .map(({ order: _order, ...r }) => r);
  return {
    kind: 'Customer',
    name: CUSTOMER,
    descriptor: 'Fleet customer · credit limit ₹3,00,000',
    period: 'Oct 2026',
    columns: { debit: 'Debit', credit: 'Credit', balance: 'Receivable' },
    raisedBy: 'debit',
    caption: 'Debit = credit sale / adjustment · Credit = collection.',
    openingLabel: 'Opening balance',
    opening,
    rows,
  };
}

const electricity: LedgerSection = {
  kind: 'Expense head',
  name: 'Electricity',
  descriptor: 'Expense category · no account of its own',
  period: 'Oct 2026',
  columns: { debit: 'Amount', credit: null, balance: 'FY to date' },
  raisedBy: 'debit',
  caption: 'Running figure = total since 01 Apr 2026.',
  openingLabel: 'Brought forward 01 Apr – 30 Sep',
  opening: 123785,
  rows: [
    {
      date: KSEB_BILL.date,
      voucherNo: KSEB_BILL.voucher,
      particulars: 'KSEB LT-VII bill Aug–Sep · consumer 1155 6730 2214',
      detail: `Funding account: ${BANK} · NEFT`,
      debit: KSEB_BILL.amount,
      credit: null,
    },
    {
      date: '2026-10-21',
      voucherNo: 'EXP-000447',
      particulars: 'KSEB ToD meter testing fee',
      detail: 'Funding account: Cash in Hand',
      debit: 1180,
      credit: null,
    },
  ],
};

export const LEDGER_REPORT_SAMPLE: LedgerReportData = {
  filters: {
    ledgerType: 'Account · Customer · Expense head (3 examples)',
    ledger: `${BANK} · ${CUSTOMER} · Electricity`,
    period: 'Oct 2026 (bank example: 01–07 Oct)',
  },
  ledgers: [bank, customerSection(), electricity],
};
