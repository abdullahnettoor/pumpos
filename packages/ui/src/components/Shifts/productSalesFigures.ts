import { compareNatural } from '@pump/shared';
import { sumRupees, toPaise } from '../../utils/ledgerWindow.js';
import {
  duText,
  type BilledSaleInput,
  type HandoverProductSaleInput,
  type StaffAssignmentInput,
} from './liveShiftInputs.js';

// ── Product sales, one row per employee ─────────────────────────────────────

export interface ProductSalesRow {
  /** The employee's user id, or null for sales with no employee. */
  attendantId: string | null;
  name: string;
  /** Σ Billed Sales by this employee. */
  billed: number;
  /** Their Handover Product Sale, or null when none is recorded. */
  handoverSale: HandoverProductSaleInput | null;
  handover: number;
  total: number;
  /** On a DU this shift (a Drawer). */
  onDrawer: boolean;
}

export interface ProductSales {
  rows: ProductSalesRow[];
  billed: number;
  handover: number;
  total: number;
}

/**
 * Product sales per employee: every attendant on a DU (a row even with no
 * sales, so their Handover Product Sale can be recorded), every other employee
 * who sold, and "Unassigned" for Billed Sales with no employee. Attendants come
 * first in dispenser order, then everyone else by name, Unassigned last.
 */
export function productSales(input: {
  assignments: StaffAssignmentInput[];
  handoverSales: HandoverProductSaleInput[];
  billed: BilledSaleInput[];
}): ProductSales {
  const rows = new Map<string, ProductSalesRow & { billedP: number; order: number }>();
  const keyOf = (id: string | null | undefined) => id || '__none__';
  const ensure = (
    id: string | null | undefined,
    name: string | null | undefined,
    order: number,
  ) => {
    const key = keyOf(id);
    let row = rows.get(key);
    if (!row) {
      row = {
        attendantId: id || null,
        name: id ? name || 'Employee' : 'Unassigned',
        billed: 0,
        billedP: 0,
        handoverSale: null,
        handover: 0,
        total: 0,
        onDrawer: false,
        order,
      };
      rows.set(key, row);
    } else if (id && name && row.name === 'Employee') row.name = name;
    return row;
  };

  const drawers = [...input.assignments].sort((a, b) => compareNatural(duText(a), duText(b)));
  drawers.forEach((a, i) => {
    const row = ensure(a.userId, a.userName, i);
    row.onDrawer = true;
  });
  const others = drawers.length;
  for (const h of input.handoverSales) {
    const row = ensure(h.attendantId, h.attendantName, others);
    row.handoverSale = h;
  }
  for (const b of input.billed) {
    const row = ensure(b.attendantId, b.attendantName, others);
    row.billedP += toPaise(b.totalAmount);
  }

  const list = [...rows.values()]
    .map((r) => {
      const handoverP = toPaise(r.handoverSale?.totalAmount);
      return {
        ...r,
        billed: r.billedP / 100,
        handover: handoverP / 100,
        total: (r.billedP + handoverP) / 100,
      };
    })
    .sort(
      (a, b) =>
        Number(a.attendantId === null) - Number(b.attendantId === null) ||
        a.order - b.order ||
        a.name.localeCompare(b.name),
    )
    .map(({ billedP: _b, order: _o, ...row }) => row);

  return {
    rows: list,
    billed: sumRupees(list.map((r) => r.billed)),
    handover: sumRupees(list.map((r) => r.handover)),
    total: sumRupees(list.map((r) => r.total)),
  };
}
