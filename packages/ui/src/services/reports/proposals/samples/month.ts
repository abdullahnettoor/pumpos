import {
  ATTENDANTS,
  NOZZLES,
  OCT_DAYS,
  r2,
  r3,
  rng,
  shiftLabel,
  type SampleNozzle,
} from './common.js';

/*
 * One generated month of forecourt activity (Oct 2026): two Shifts a Business
 * Day, one Attendant per DU per Shift, a meter reading pair per Nozzle and a
 * Drawer per Attendant. Reports that read Shifts (product sales, cash
 * variance, POS reconciliation, P&L) share it, so their figures agree.
 */

export interface NozzleShiftReading {
  nozzle: SampleNozzle;
  attendant: string;
  opening: number;
  closing: number;
  testing: number;
  netL: number;
  rate: number;
  value: number;
}

export interface DrawerShift {
  attendant: string;
  du: string;
  openingFloat: number;
  cashSales: number;
  cashDrops: number;
  expected: number;
  declared: number;
  variance: number;
}

export interface MonthShift {
  date: string;
  seq: number;
  label: string;
  name: 'Morning' | 'Evening';
  readings: NozzleShiftReading[];
  drawers: DrawerShift[];
  /** Fuel value by payment mode (fuel only; product sales are separate). */
  modes: { cash: number; card: number; upi: number; credit: number; omc: number };
  /** Product (lube) sales value in the Shift, GST inclusive. */
  productValue: number;
  officeCounted: number;
  officeExpected: number;
}

const DUS = ['DU-1', 'DU-2', 'DU-3'];

function build(): MonthShift[] {
  const r = rng(20261001);
  const meter = new Map<string, number>(NOZZLES.map((n, i) => [n.code, 184200.5 + i * 53110.25]));
  const out: MonthShift[] = [];
  OCT_DAYS.forEach((date, di) => {
    (['Morning', 'Evening'] as const).forEach((name, si) => {
      const crew = [...ATTENDANTS];
      const shiftCrew = DUS.map((_, k) => crew[(di * 2 + si + k * 2) % crew.length]);
      const weekend = [3, 4].includes(di % 7) ? 1.12 : 1;
      const readings: NozzleShiftReading[] = NOZZLES.map((nz) => {
        const base = nz.fuel.code === 'MS' ? 640 : nz.fuel.code === 'HSD' ? 760 : 145;
        const gross = r3(base * weekend * r.between(0.82, 1.18) * (si === 0 ? 1.08 : 0.92));
        const testing = di % 10 === 0 && si === 0 ? 5 : 0;
        const opening = meter.get(nz.code)!;
        const closing = r3(opening + gross);
        meter.set(nz.code, closing);
        const netL = r3(gross - testing);
        return {
          nozzle: nz,
          attendant: shiftCrew[DUS.indexOf(nz.du)],
          opening,
          closing,
          testing,
          netL,
          rate: nz.fuel.rate,
          value: r2(netL * nz.fuel.rate),
        };
      });
      const fuel = readings.reduce((a, x) => a + x.value, 0);
      const credit = r2(fuel * r.between(0.1, 0.16));
      const omc = r2(fuel * r.between(0.02, 0.05));
      const card = r2(fuel * r.between(0.1, 0.14));
      const upi = r2(fuel * r.between(0.24, 0.3));
      const cash = r2(fuel - credit - omc - card - upi);
      const productValue = r2(r.between(1800, 5200));
      const productCash = r2(productValue * 0.6);
      const drawers: DrawerShift[] = DUS.map((du, k) => {
        const duFuel = readings.filter((x) => x.nozzle.du === du).reduce((a, x) => a + x.value, 0);
        const cashSales = r2((cash * duFuel) / fuel + (k === 0 ? productCash : 0));
        const openingFloat = 2000;
        const cashDrops = cashSales > 40000 ? 20000 : 0;
        const expected = r2(openingFloat + cashSales - cashDrops);
        const roll = r.next();
        const variance =
          roll < 0.55
            ? 0
            : roll < 0.8
              ? -r2(r.int(1, 30) * 10)
              : roll < 0.93
                ? r2(r.int(1, 15) * 10)
                : -r2(r.int(40, 120) * 10);
        return {
          attendant: shiftCrew[k],
          du,
          openingFloat,
          cashSales,
          cashDrops,
          expected,
          declared: r2(expected + variance),
          variance,
        };
      });
      const officeExpected = r2(drawers.reduce((a, d) => a + d.declared, 0));
      const officeDiff = r.next() < 0.85 ? 0 : -r2(r.int(1, 10) * 10);
      out.push({
        date,
        seq: si + 1,
        label: shiftLabel(date, si + 1),
        name,
        readings,
        drawers,
        modes: { cash, card, upi, credit, omc },
        productValue,
        officeExpected,
        officeCounted: r2(officeExpected + officeDiff),
      });
    });
  });
  return out;
}

export const OCT_SHIFTS: MonthShift[] = build();
