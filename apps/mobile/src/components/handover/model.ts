/**
 * The handover form's data shapes and pure helpers. No React: everything here
 * is derived from what the attendant has typed plus the `my-assignment` read,
 * so the step statuses, validation and the expected-cash formula are testable
 * without rendering.
 */

export type TerminalState = Record<string, { card: string; upi: string; batch: string }>;

export interface DuFormState {
  readings: Record<string, string>; // nozzleId -> closing
  testing: Record<string, string>; // nozzleId -> testing volume
  terminals: TerminalState; // terminalId -> {card, upi, batch}
  aggregateCard: string;
  aggregateUpi: string;
  cash: string;
  /** Cash taken from this Drawer mid-shift (ADR 0005). */
  drops: string;
}

export interface CreditLine {
  id?: string;
  /** Null for an anonymous OMC card sale. */
  customerId: string | null;
  customerName: string | null;
  customerType?: string | null;
  vehicleId: string | null;
  vehicleLabel?: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  notes: string | null;
}

export interface DuProduct {
  id: string;
  name: string;
  unit: string;
  price: number;
}

export interface MerchRow {
  productId: string;
  quantity: string;
}

/**
 * An amount as the input shows it: blank for zero or missing, so the operator
 * types into an empty box (placeholder "0") instead of deleting a 0 first (#302).
 * Submitting a blank still sends 0 (`num`).
 */
export const blankZero = (v: string | number | null | undefined): string =>
  v != null && v !== '' && Number(v) !== 0 && Number.isFinite(Number(v)) ? String(Number(v)) : '';

export const num = (v: string | number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** What a DU's entry looks like before the attendant touches it. Pure over `du`. */
export function seedForm(du: any): DuFormState {
  const readings: Record<string, string> = {};
  const testing: Record<string, string> = {};
  for (const nz of du.nozzles) {
    readings[nz.nozzleId] = String(nz.closingReading ?? nz.openingReading ?? 0);
    testing[nz.nozzleId] = blankZero(nz.testingVolume);
  }
  const terminals: TerminalState = {};
  for (const t of du.terminals) {
    const entry = (du.terminalEntries || []).find((e: any) => e.terminalId === t.terminalId);
    terminals[t.terminalId] = {
      card: blankZero(entry?.cardAmount),
      upi: blankZero(entry?.upiAmount),
      batch: entry?.batchRef ?? '',
    };
  }
  return {
    readings,
    testing,
    terminals,
    aggregateCard: du.terminals.length === 0 ? blankZero(du.handover?.cardHandedOver) : '',
    aggregateUpi: du.terminals.length === 0 ? blankZero(du.handover?.upiHandedOver) : '',
    cash: blankZero(du.handover?.cashHandedOver),
    drops: blankZero(du.handover?.cashDrops),
  };
}
