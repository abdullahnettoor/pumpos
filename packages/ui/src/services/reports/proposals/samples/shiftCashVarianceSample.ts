import type {
  DenominationLine,
  ShiftCashVarianceData,
  ShiftVarianceDay,
  ShiftVarianceShift,
} from '../shiftCashVarianceDoc.js';
import { PERIOD, r2 } from './common.js';
import { OCT_SHIFTS } from './month.js';

const DETAIL_DAYS = 5;

const shifts: ShiftVarianceShift[] = OCT_SHIFTS.map((s) => ({
  date: s.date,
  label: s.label,
  name: s.name,
  drawers: s.drawers.map((d) => ({ ...d })),
  unnamedCloseDrops: 0,
  officeExpected: s.officeExpected,
  officeCounted: s.officeCounted,
}));

const dates = [...new Set(shifts.map((s) => s.date))];
const shown = shifts.filter((s) => dates.indexOf(s.date) < DETAIL_DAYS);

const month: ShiftVarianceDay[] = dates.map((date) => {
  const ss = shifts.filter((s) => s.date === date);
  return {
    date,
    shifts: ss.length,
    attendantVariance: r2(ss.flatMap((s) => s.drawers).reduce((a, d) => a + d.variance, 0)),
    officeVariance: r2(ss.reduce((a, s) => a + s.officeCounted - s.officeExpected, 0)),
  };
});

/** A plausible note count for one close, the coins taking the remainder so it adds to the counted cash. */
function denominations(counted: number): DenominationLine[] {
  const shares: [number, number][] = [
    [500, 0.58],
    [200, 0.45],
    [100, 0.7],
    [50, 0.6],
    [20, 0.55],
    [10, 0.6],
  ];
  let left = counted;
  const lines: DenominationLine[] = shares.map(([face, share]) => {
    const count = Math.floor((left * share) / face);
    left = r2(left - count * face);
    return { label: `₹${face}`, count, value: count * face };
  });
  lines.push({ label: 'Coins', count: null, value: r2(left) });
  return lines;
}

const sample = shown[shown.length - 1];
const drawers = shifts.flatMap((s) => s.drawers.map((d) => ({ ...d, shift: s.label })));
const largest = drawers.reduce((a, d) => (d.variance < a.variance ? d : a));

export const SHIFT_CASH_VARIANCE_SAMPLE: ShiftCashVarianceData = {
  filters: { period: PERIOD, shift: 'All', attendant: 'All', du: 'All', varianceOnly: 'No' },
  shifts: shown,
  shiftsMore: shifts.length - shown.length,
  month,
  shiftsWithVariance: shifts.filter(
    (s) => s.officeCounted !== s.officeExpected || s.drawers.some((d) => d.variance !== 0),
  ).length,
  largestShort: { amount: largest.variance, attendant: largest.attendant, shift: largest.shift },
  denominations: {
    shift: sample.label,
    counted: sample.officeCounted,
    lines: denominations(sample.officeCounted),
  },
};
