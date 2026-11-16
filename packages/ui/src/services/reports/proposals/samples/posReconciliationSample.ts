import type { PosReconLine, PosReconciliationData } from '../posReconciliationDoc.js';
import { OCT_DAYS, r2 } from './common.js';
import { OCT_SHIFTS } from './month.js';

/*
 * The first week of Oct by date and payment mode, summed over the day's
 * Shifts (OCT_SHIFTS). Product sales: 60% cash (in the Drawers), 15% card,
 * 25% UPI. Two exceptions to reconcile: the 06–07 Oct card batches are not yet
 * credited, and the 03 Oct UPI settlement is ₹1,250 short.
 */

const DAYS = OCT_DAYS.slice(0, 7);
const MDR_CARD = 0.009;
const PENDING_CARD = ['2026-10-06', '2026-10-07'];
const UPI_SHORT = { date: '2026-10-03', amount: 1250 };

const nextDay = (iso: string) => OCT_DAYS[OCT_DAYS.indexOf(iso) + 1] ?? iso;
const short = (iso: string) => {
  const [, , d] = iso.split('-');
  return `${d} Oct`;
};

function day(date: string, i: number): PosReconLine[] {
  const ss = OCT_SHIFTS.filter((s) => s.date === date);
  const drawers = ss.flatMap((s) => s.drawers);
  const product = ss.reduce((a, s) => a + s.productValue, 0);
  const total = (k: 'card' | 'upi' | 'credit' | 'omc') =>
    r2(ss.reduce((a, s) => a + s.modes[k], 0));

  const cashRecorded = r2(drawers.reduce((a, d) => a + d.cashSales, 0));
  const cashDeclared = r2(
    drawers.reduce((a, d) => a + d.declared + d.cashDrops - d.openingFloat, 0),
  );

  const card = r2(total('card') + product * 0.15);
  const cardPending = PENDING_CARD.includes(date);
  const mdr = r2(card * MDR_CARD);
  const cardSettled = cardPending ? 0 : r2(card - mdr);

  const upi = r2(total('upi') + product * 0.25);
  const upiShort = date === UPI_SHORT.date ? UPI_SHORT.amount : 0;
  const upiSettled = r2(upi - upiShort);

  const omc = total('omc');

  return [
    {
      date,
      mode: 'Cash',
      terminal: 'Drawers',
      recorded: cashRecorded,
      declared: cashDeclared,
      settled: null,
      charges: null,
      difference: r2(cashDeclared - cashRecorded),
    },
    {
      date,
      mode: 'Card',
      terminal: `HDFC POS T-01 · batch ${String(4512 + i).padStart(6, '0')}`,
      remark: cardPending ? 'Batch not yet credited' : `Credited ${short(nextDay(date))}`,
      status: cardPending ? 'pending' : undefined,
      recorded: card,
      declared: card,
      settled: cardSettled,
      charges: cardPending ? null : mdr,
      difference: cardPending ? card : 0,
    },
    {
      date,
      mode: 'UPI',
      terminal: 'Paytm UPI T-02',
      remark: upiShort
        ? 'Settlement short of the terminal total'
        : `Credited ${short(nextDay(date))}`,
      status: upiShort ? 'difference' : undefined,
      recorded: upi,
      declared: upi,
      settled: upiSettled,
      charges: 0,
      difference: upiShort,
    },
    {
      date,
      mode: 'Credit',
      terminal: 'Customer ledger',
      recorded: total('credit'),
      declared: null,
      settled: null,
      charges: null,
      difference: null,
    },
    {
      date,
      mode: 'OMC card',
      terminal: 'OMC Wallet',
      recorded: omc,
      declared: omc,
      settled: omc,
      charges: 0,
      difference: 0,
    },
  ];
}

export const POS_RECONCILIATION_SAMPLE: PosReconciliationData = {
  filters: { period: '01–07 Oct 2026', settledTo: '08 Oct 2026', mode: 'All', terminal: 'All' },
  lines: DAYS.flatMap(day),
};
