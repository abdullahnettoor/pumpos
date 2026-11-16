import type { DayBookData, DayBookEntry } from '../dayBookDoc.js';
import { r2, shiftLabel } from './common.js';
import { OCT_SHIFTS } from './month.js';
import { COLLECTIONS, CREDIT_SALES, DAY_BOOK_DATE, addDays } from './debtorsAgeingSample.js';
import { DAY_BOOK_LOAD, PAYMENTS, PURCHASES } from './creditorsAgeingSample.js';
import { dShort } from '../shared.js';

/*
 * 15 Oct 2026. The forecourt half is that Business Date's two Shifts from the
 * month (payment split as closed), with its credit sales as the debtors
 * sample bills them; the office half uses the collections, purchases and
 * payments the ageing samples carry for the same Entry Date.
 */

const DATE = DAY_BOOK_DATE;
const SHIFT_TIMES: Record<number, { close: string; credit: string[] }> = {
  1: { close: '14:05', credit: ['07:42', '09:18', '10:55', '12:31', '13:20'] },
  2: { close: '22:10', credit: ['15:12', '16:47', '18:25', '19:58', '21:04'] },
};

function forecourt(): DayBookEntry[] {
  const out: DayBookEntry[] = [];
  for (const s of OCT_SHIFTS.filter((x) => x.date === DATE)) {
    const t = SHIFT_TIMES[s.seq];
    const label = shiftLabel(DATE, s.seq);
    const litres = (code: string) =>
      r2(s.readings.filter((x) => x.nozzle.fuel.code === code).reduce((a, x) => a + x.netL, 0));
    CREDIT_SALES.filter((b) => b.date === DATE && b.shift === s.seq).forEach((b, i) =>
      out.push({
        time: t.credit[i] ?? t.close,
        type: 'Credit sale',
        voucherNo: b.docNo,
        shift: label,
        party: b.customer,
        particulars: 'Fuel on credit · Diesel',
        detail: `${b.vehicle} · receivable, not drawer cash`,
        debit: b.amount,
        credit: null,
      }),
    );
    const meters = `MS ${litres('MS').toLocaleString('en-IN')} L · HSD ${litres('HSD').toLocaleString('en-IN')} L · XP95 ${litres('XP95').toLocaleString('en-IN')} L`;
    out.push(
      {
        time: t.close,
        type: 'Sale',
        voucherNo: `SS-${label}`,
        shift: label,
        party: 'Drawers → Cash in Hand',
        particulars: 'Fuel sales · cash',
        detail: `Nozzle readings, shift total ${meters}`,
        debit: s.modes.cash,
        credit: null,
      },
      {
        time: t.close,
        type: 'Sale',
        voucherNo: `SS-${label}`,
        shift: label,
        party: 'Merchant Clearing',
        particulars: 'Fuel sales · card',
        debit: s.modes.card,
        credit: null,
      },
      {
        time: t.close,
        type: 'Sale',
        voucherNo: `SS-${label}`,
        shift: label,
        party: 'Merchant Clearing',
        particulars: 'Fuel sales · UPI',
        debit: s.modes.upi,
        credit: null,
      },
      {
        time: t.close,
        type: 'Sale',
        voucherNo: `SS-${label}`,
        shift: label,
        party: 'OMC Wallet (CMS)',
        particulars: 'Fuel sales · OMC card',
        debit: s.modes.omc,
        credit: null,
      },
      {
        time: t.close,
        type: 'Sale',
        voucherNo: `SS-${label}`,
        shift: label,
        party: 'Drawers / Merchant Clearing',
        particulars: 'Product sales · lubes & accessories',
        detail: 'GST inclusive',
        debit: s.productValue,
        credit: null,
      },
    );
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function office(): DayBookEntry[] {
  const prev = addDays(DATE, -1);
  const prevShifts = OCT_SHIFTS.filter((s) => s.date === prev);
  const cash = Math.floor(prevShifts.reduce((a, s) => a + s.modes.cash, 0) / 1000) * 1000;
  const card = prevShifts.reduce((a, s) => a + s.modes.card, 0);
  const upi = prevShifts.reduce((a, s) => a + s.modes.upi, 0);
  const mdr = r2(card * 0.009);
  const settled = r2(card + upi - mdr);

  const iocl = PURCHASES.find(
    (p) => p.supplier === 'Indian Oil Corporation Ltd' && p.date === DATE,
  )!;
  const ioclPaid = PAYMENTS.find(
    (p) => p.supplier === 'Indian Oil Corporation Ltd' && p.date === DATE,
  )!;
  const battery = PURCHASES.find(
    (p) => p.supplier === 'Edappally Battery Centre' && p.date === DATE,
  )!;
  const cols = COLLECTIONS.filter((c) => c.date === DATE);

  const out: DayBookEntry[] = [
    {
      time: '06:40',
      type: 'Supplier payment',
      voucherNo: 'SPY-000752',
      shift: null,
      party: 'Indian Oil Corporation Ltd',
      particulars: 'RTGS for today’s indent',
      detail: 'Funding account: HDFC Bank ••4417',
      debit: null,
      credit: ioclPaid.amount,
    },
    {
      time: '07:05',
      type: 'Purchase',
      voucherNo: `PUR-${iocl.billNo.slice(-4)}`,
      shift: null,
      party: 'Indian Oil Corporation Ltd',
      particulars: `Fuel Purchase · invoice ${iocl.billNo}`,
      detail: `MS ${DAY_BOOK_LOAD.petrolL.toLocaleString('en-IN')} L + HSD ${DAY_BOOK_LOAD.dieselL.toLocaleString('en-IN')} L · payable only, no stock`,
      debit: null,
      credit: iocl.amount,
    },
    {
      time: '07:50',
      type: 'Decantation',
      voucherNo: 'DEC-000318',
      shift: null,
      party: 'Tanks T1, T2',
      particulars: `T1 Petrol +${DAY_BOOK_LOAD.petrolL.toLocaleString('en-IN')} L · T2 Diesel +${DAY_BOOK_LOAD.dieselL.toLocaleString('en-IN')} L`,
      detail: `Tanker KL-07-BQ-5521 · Business Date, no Shift · stock only, no amount`,
      debit: null,
      credit: null,
    },
    ...cols.map((c, i) => ({
      time: ['10:15', '11:40'][i] ?? '12:00',
      type: 'Collection' as const,
      voucherNo: `COL-${String(561 + i).padStart(6, '0')}`,
      shift: null,
      party: c.customer,
      particulars: `Collection · ${c.method}`,
      detail: `Funding account: ${c.account}`,
      debit: c.amount,
      credit: null,
    })),
    {
      time: '10:30',
      type: 'Transfer',
      voucherNo: 'TRF-002198',
      shift: null,
      party: 'Cash in Hand → Bank',
      particulars: 'Cash deposit',
      detail: `Cash sales of ${dShort(prev)} · into HDFC Bank ••4417`,
      debit: cash,
      credit: cash,
    },
    {
      time: '11:05',
      type: 'Settlement',
      voucherNo: 'STL-001420',
      shift: null,
      party: 'Merchant Clearing → Bank',
      particulars: 'Card + UPI settlement',
      detail: `Into HDFC Bank ••4417 · sales of ${dShort(prev)}, net of MDR ₹${mdr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      debit: settled,
      credit: settled,
    },
    {
      time: '12:20',
      type: 'Expense',
      voucherNo: 'EXP-000439',
      shift: null,
      party: 'Petty Cash',
      particulars: 'Staff welfare · tea and snacks',
      debit: null,
      credit: 480,
    },
    {
      time: '15:30',
      type: 'Purchase',
      voucherNo: `PUR-${battery.billNo.slice(-4)}`,
      shift: null,
      party: 'Edappally Battery Centre',
      particulars: `Product Purchase · bill ${battery.billNo}`,
      detail: 'Distilled water, terminals · adds stock · Business Date, no Shift',
      debit: null,
      credit: battery.amount,
    },
    {
      time: '16:10',
      type: 'Income',
      voucherNo: 'INC-000087',
      shift: null,
      party: 'Cash in Hand',
      particulars: 'Scrap sale · empty lube cans and drums',
      debit: 1850,
      credit: null,
    },
    {
      time: '17:45',
      type: 'Expense',
      voucherNo: 'EXP-000440',
      shift: null,
      party: 'Cash in Hand',
      particulars: 'Forecourt cleaning · degreaser and mops',
      debit: null,
      credit: 1260,
    },
  ];
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export const DAY_BOOK_SAMPLE: DayBookData = {
  date: DATE,
  filters: { voucherType: 'All', party: 'All' },
  forecourt: forecourt(),
  office: office(),
};
