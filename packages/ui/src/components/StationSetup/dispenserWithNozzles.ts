import type { DispenserWithNozzlesBody } from '../../services/cloud.js';

/** A nozzle row in the add-dispenser drawer. */
export interface NozzleInput {
  name: string;
  productId: string;
  tankId: string;
  currentReading: number;
}

export const NOZZLE_SELECTION_MESSAGE =
  'Please make sure all nozzles have a valid tank and product selected.';

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
  return {
    ok: true,
    body: {
      stationId: input.stationId,
      name: input.name,
      code: input.code.toUpperCase(),
      status: 'ACTIVE',
      nozzles: input.nozzles.map((n) => ({
        name: n.name,
        tankId: n.tankId,
        productId: n.productId,
        currentReading: n.currentReading,
      })),
    },
  };
}

/**
 * A standard dispenser layout for the add drawer's auto-fill: `perFuel`
 * nozzles on Petrol (MS), then on Diesel (HSD), each fed from the first tank
 * of that fuel. A fuel with no product or no tank is skipped. Names continue
 * from the station's existing nozzles (`N{existing + 1}`, …).
 */
export function standardNozzleLayout(input: {
  perFuel: 1 | 2;
  products: readonly { id: string; code: string }[];
  tanks: readonly { id: string; productId: string }[];
  existingNozzles: number;
}): NozzleInput[] {
  const rows: NozzleInput[] = [];
  for (const code of ['MS', 'HSD'] as const) {
    const product = input.products.find((p) => p.code === code);
    const tank = product && input.tanks.find((t) => t.productId === product.id);
    if (!product || !tank) continue;
    for (let i = 0; i < input.perFuel; i++) {
      rows.push({
        name: `N${input.existingNozzles + rows.length + 1}`,
        productId: product.id,
        tankId: tank.id,
        currentReading: 1000,
      });
    }
  }
  return rows;
}
