import type { TankDayLine, TankVariationData } from '../tankVariationDoc.js';
import { OCT_DAYS, PERIOD, TANKS, r2, rng } from './common.js';
import { OCT_SHIFTS } from './month.js';

/** One Decantation Tank Line: what the tanker invoiced and what the dips measured in. */
export interface FuelReceipt {
  date: string;
  tank: string;
  fuelCode: string;
  invoicedL: number;
  receivedL: number;
}

/** A tanker compartment load per product (IOCL invoices in whole KL). */
const LOAD: Record<string, number> = { MS: 8000, HSD: 12000, XP95: 4000 };
/** Dip stock on the morning of 01 Oct. */
const OPENING: Record<string, number> = { T1: 9420, T2: 10850, T3: 5610 };
/** Planted Variance (fraction of sales) on a few days, so the register shows the limit at work. */
const PLANTED: Record<string, Record<number, number>> = {
  T1: { 12: -0.0066 },
  T2: { 7: -0.0062, 18: -0.0071, 26: 0.0058 },
  T3: { 21: 0.0094 },
};

const soldFrom = (date: string, tank: string) =>
  r2(
    OCT_SHIFTS.filter((s) => s.date === date)
      .flatMap((s) => s.readings)
      .filter((x) => x.nozzle.tank === tank)
      .reduce((a, x) => a + x.netL, 0),
  );

function build(): { days: TankDayLine[]; receipts: FuelReceipt[] } {
  const r = rng(20261004);
  const days: TankDayLine[] = [];
  const receipts: FuelReceipt[] = [];
  for (const tank of TANKS) {
    let opening = OPENING[tank.code];
    OCT_DAYS.forEach((date, di) => {
      const load = LOAD[tank.fuel.code];
      let received = 0;
      if (opening + load <= tank.capacity * 0.95) {
        received = load + r.int(-14, 4);
        receipts.push({
          date,
          tank: tank.code,
          fuelCode: tank.fuel.code,
          invoicedL: load,
          receivedL: received,
        });
      }
      const sales = soldFrom(date, tank.code);
      const bookClosing = r2(opening + received - sales);
      const planted = PLANTED[tank.code][di + 1];
      const drift =
        planted ?? (tank.code === 'T3' ? r.between(-0.0025, 0.0012) : r.between(-0.0042, 0.0022));
      const dipClosing = Math.round(bookClosing + sales * drift);
      days.push({
        date,
        tank: tank.code,
        fuel: tank.fuel.name,
        openingBook: opening,
        receipts: received,
        sales,
        bookClosing,
        dipClosing,
      });
      opening = dipClosing;
    });
  }
  return { days, receipts };
}

const built = build();

/** Decantation receipts, read by the purchase and stock samples so the three reports agree. */
export const FUEL_RECEIPTS: FuelReceipt[] = built.receipts;
export const TANK_DAYS: TankDayLine[] = built.days;

export const TANK_VARIATION_SAMPLE: TankVariationData = {
  filters: { period: PERIOD, tank: 'All (T1, T2, T3)', fuel: 'All' },
  limitPct: 0.5,
  detailTank: 'T2',
  tanks: TANKS.map((t) => ({
    tank: t.code,
    fuel: t.fuel.name,
    capacity: t.capacity,
    costPrice: t.fuel.cost,
  })),
  days: built.days,
};
