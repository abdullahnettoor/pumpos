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
