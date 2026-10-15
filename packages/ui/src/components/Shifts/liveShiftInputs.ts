import { dispenserLabel } from '@pump/shared';

/**
 * What the Live shift figures read (#533): the slices of the shift-status
 * payload and the Product Sale lists, and the small number helpers the
 * figure modules share.
 */

// ── Inputs: the slices of the shift-status payload this module reads ────────

export type Num = number | string | null | undefined;

export interface NozzleReadingInput {
  nozzleId: string;
  nozzleName?: string | null;
  duId?: string | null;
  duCode?: string | null;
  duName?: string | null;
  productId?: string | null;
  productName?: string | null;
  productCode?: string | null;
  unit?: string | null;
  openingReading: Num;
  closingReading: Num;
  unitPrice?: Num;
}

export interface StaffAssignmentInput {
  userId: string;
  userName?: string | null;
  duId: string;
  duCode?: string | null;
  duName?: string | null;
}

export interface HandoverInput {
  id?: string;
  userId: string;
  duId: string;
  cashHandedOver?: Num;
  cardHandedOver?: Num;
  upiHandedOver?: Num;
  creditHandedOver?: Num;
  varianceAmount?: Num;
  cashDrops?: Num;
  createdAt?: string | null;
}

/** A Drawer as the server reconciles it; `variance` is null until it hands over. */
export interface ReconDrawerInput {
  attendantId: string;
  duId?: string | null;
  variance: number | null;
  cashDrops?: Num;
}

export interface ShiftInput {
  openedAt: string;
  scheduledEndTime?: string | null;
  nozzleReadings?: NozzleReadingInput[] | null;
  staffAssignments?: StaffAssignmentInput[] | null;
  handovers?: HandoverInput[] | null;
  reconciliation?: { drawers?: ReconDrawerInput[] | null } | null;
}

/** A Handover Product Sale (one per employee per shift). */
export interface HandoverProductSaleInput {
  id: string;
  attendantId?: string | null;
  attendantName?: string | null;
  totalAmount: Num;
}

/** A Billed Sale recorded during the shift. */
export interface BilledSaleInput {
  id?: string;
  attendantId?: string | null;
  attendantName?: string | null;
  totalAmount: Num;
}

/** Card / UPI / credit before any Handover: the shift's own transaction totals. */
export interface PreHandoverTotals {
  card: number;
  upi: number;
  credit: number;
}

export const DRAWER_KEY = (userId: string, duId: string) => `${userId}|${duId}`;
export const n = (v: Num) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
/** Litres to the meter's 3 decimals, so a difference of readings reads as shown. */
export const litres3 = (v: number) => Math.round(v * 1000) / 1000;
export const rupees2 = (v: number) => Math.round(v * 100) / 100;

export const duText = (d: { duCode?: string | null; duName?: string | null }) =>
  dispenserLabel(d) || 'DU';
