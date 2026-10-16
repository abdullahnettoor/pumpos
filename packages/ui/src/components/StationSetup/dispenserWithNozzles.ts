import type { DispenserWithNozzlesBody } from '../../services/cloud.js';

/** A nozzle row in the add-dispenser drawer. */
export interface NozzleInput {
  name: string;
  productId: string;
  tankId: string;
  /** Opening meter reading; `null` until the operator types one. */
  currentReading: number | null;
}

export const NOZZLE_SELECTION_MESSAGE =
  'Please make sure all nozzles have a valid tank and product selected.';

export const NOZZLE_READING_MESSAGE = 'Enter the opening reading for every nozzle.';

/** Shown when auto-fill finds no fuel with a tank to map nozzles to. */
export const AUTO_FILL_NEEDS_TANK = 'Add a tank for a fuel first.';

export type DispenserWithNozzlesDraft =
  { ok: true; body: DispenserWithNozzlesBody } | { ok: false; message: string };

/**
 * The one request that creates a dispenser and its nozzles (#591), or the
 * reason the drawer cannot send it yet. Checked before anything is sent, so a
 * nozzle with no tank or product never leaves a dispenser behind.
 */
export function dispenserWithNozzlesBody(input: {
  stationId: string;
  name: string;
  code: string;
  nozzles: NozzleInput[];
}): DispenserWithNozzlesDraft {
  if (input.nozzles.some((n) => !n.tankId || !n.productId))
    return { ok: false, message: NOZZLE_SELECTION_MESSAGE };
  const readings: number[] = [];
  for (const n of input.nozzles) {
    if (n.currentReading === null || !Number.isFinite(n.currentReading) || n.currentReading < 0)
      return { ok: false, message: NOZZLE_READING_MESSAGE };
    readings.push(n.currentReading);
  }
  return {
    ok: true,
    body: {
      stationId: input.stationId,
      name: input.name,
      code: input.code.toUpperCase(),
      status: 'ACTIVE',
      nozzles: input.nozzles.map((n, i) => ({
        name: n.name,
        tankId: n.tankId,
        productId: n.productId,
        currentReading: readings[i],
      })),
    },
  };
}

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * The fuels auto-fill can map nozzles to: every given fuel that has at least
 * one tank, ordered by name, each paired with its first tank by name. Product
 * codes play no part (#638): stations type their own, so `MS` / `HSD` cannot
 * be relied on.
 */
export function fuelsWithTanks<P extends { id: string; name: string }>(input: {
  products: readonly P[];
  tanks: readonly { id: string; name: string; productId: string }[];
}): { product: P; tankId: string }[] {
  return [...input.products].sort(byName).flatMap((product) => {
    const [tank] = input.tanks.filter((t) => t.productId === product.id).sort(byName);
    return tank ? [{ product, tankId: tank.id }] : [];
  });
}

/**
 * A standard dispenser layout for the add drawer's auto-fill: `perFuel`
 * nozzles on each fuel that has a tank (see `fuelsWithTanks`), Dual = 1 per
 * fuel, Quad = 2. The opening reading is left empty for the operator. Names
 * continue from the station's existing nozzles (`N{existing + 1}`, …).
 */
export function standardNozzleLayout(input: {
  perFuel: 1 | 2;
  products: readonly { id: string; name: string }[];
  tanks: readonly { id: string; name: string; productId: string }[];
  existingNozzles: number;
}): NozzleInput[] {
  const rows: NozzleInput[] = [];
  for (const { product, tankId } of fuelsWithTanks(input)) {
    for (let i = 0; i < input.perFuel; i++) {
      rows.push({
        name: `N${input.existingNozzles + rows.length + 1}`,
        productId: product.id,
        tankId,
        currentReading: null,
      });
    }
  }
  return rows;
}
