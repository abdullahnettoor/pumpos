import { isHandoverDue, type ShiftStatusState } from '@pump/shared';
import { sumRupees } from '../../utils/ledgerWindow.js';
import { beforeCloseChecklist, type CheckItem } from './beforeClose.js';
import { drawerFigures, takings, type DrawerFigures, type Takings } from './drawerFigures.js';
import type {
  BilledSaleInput,
  HandoverProductSaleInput,
  PreHandoverTotals,
  ShiftInput,
} from './liveShiftInputs.js';
import {
  countedRows,
  fuelTotals,
  isPendingGroup,
  nozzleGroups,
  type FuelTotals,
  type NozzleGroup,
} from './nozzleFigures.js';
import { productSales, type ProductSales } from './productSalesFigures.js';

export * from './liveShiftInputs.js';
export * from './nozzleFigures.js';
export * from './drawerFigures.js';
export * from './productSalesFigures.js';
export * from './beforeClose.js';

/**
 * The Live shift's figures (#533, layout B): the nozzle readings grouped by
 * Drawer, the four "This shift" tiles, the takings summary, the Product sales
 * rows and the Before close checklist. Pure: every figure on the Live shift tab
 * is worked out here, from the shift-status payload and the Product Sale lists,
 * so the components only lay them out. Money is summed in whole paise.
 *
 * Split by responsibility: `nozzleFigures` (readings by Drawer), `drawerFigures`
 * (variance, drops, takings), `productSalesFigures`, `beforeClose`; this module
 * composes them and re-exports each.
 *
 * The formulas are the ones the screen used before the redesign (volume =
 * closing − opening, value = volume × rate, attendant variance from the server
 * reconciliation); this module only regroups them.
 */

// ── The shift bar ───────────────────────────────────────────────────────────

/** Live, or Past scheduled end once the template's end has passed. */
export function liveShiftState(
  shift: Pick<ShiftInput, 'openedAt' | 'scheduledEndTime'>,
  now: number,
  timeZone?: string,
): ShiftStatusState {
  return timeZone && isHandoverDue(shift.openedAt, now, shift.scheduledEndTime, timeZone)
    ? 'shift-past-end'
    : 'shift-live';
}

// ── Everything the Live shift tab shows ─────────────────────────────────────

export interface LiveShiftFigures {
  groups: NozzleGroup[];
  fuel: FuelTotals;
  drawers: DrawerFigures;
  takings: Takings;
  products: ProductSales;
  /** Fuel (metered so far) + Product sales, rupees. */
  sales: number;
  /** The Drawers not handed over yet ("DU2 · Suresh"). */
  pending: NozzleGroup[];
  checklist: CheckItem[];
}

export function liveShiftFigures(input: {
  shift: ShiftInput;
  /** Declared cash sales from the close-shift cash summary. */
  cashDeclared: number;
  before: PreHandoverTotals;
  handoverSales: HandoverProductSaleInput[];
  billed: BilledSaleInput[];
  now: number;
  timeZone?: string;
  formatMoney: (rupees: number) => string;
}): LiveShiftFigures {
  const groups = nozzleGroups(input.shift, { now: input.now, timeZone: input.timeZone });
  const fuel = fuelTotals(countedRows(groups));
  const drawers = drawerFigures(input.shift);
  const products = productSales({
    assignments: input.shift.staffAssignments ?? [],
    handoverSales: input.handoverSales,
    billed: input.billed,
  });
  return {
    groups,
    fuel,
    drawers,
    takings: takings(input.shift, input.cashDeclared, input.before),
    products,
    sales: sumRupees([fuel.value, products.total]),
    pending: groups.filter(isPendingGroup),
    checklist: beforeCloseChecklist(groups, drawers, input.formatMoney),
  };
}
