/**
 * The handover form's data shapes and pure helpers. No React: everything here
 * is derived from what the attendant has typed plus the `my-assignment` read,
 * so the step statuses, validation and the expected-cash formula are testable
 * without rendering.
 */

export type TerminalState = Record<string, { card: string; upi: string; batch: string }>;

/** A product from the catalogue, as the merchandise picker reads it. */
export interface MerchProduct {
  id: string;
  name: string;
  brand?: string | null;
  unit?: string | null;
  productType?: string | null;
  sellingPrice?: number | string | null;
  isActive?: boolean;
}

/** A nozzle as `/shifts/my-assignment` returns it. */
export interface AssignedNozzle {
  nozzleId: string;
  nozzleName: string;
  productId: string | null;
  productName: string;
  unit: string;
  openingReading: number;
  /** Set once a Handover has recorded it; null before. */
  closingReading?: number | null;
  testingVolume?: number | null;
  unitPrice: number | null;
}

/** A Payment Terminal bound to the DU. */
export interface AssignedTerminal {
  terminalId: string;
  label: string;
  supportsCard?: boolean;
  supportsUpi?: boolean;
}

/** The Handover already recorded for a DU, if any. */
export interface RecordedHandover {
  cashHandedOver?: string | number | null;
  cashDrops?: string | number | null;
  cardHandedOver?: string | number | null;
  upiHandedOver?: string | number | null;
}

export interface RecordedTerminalEntry {
  terminalId: string;
  cardAmount?: string | number | null;
  upiAmount?: string | number | null;
  batchRef?: string | null;
}

/** One Dispenser Unit the signed-in user is accountable for this Shift. */
export interface AssignedDu {
  duId: string;
  duName: string;
  duCode?: string | null;
  openingFloat?: number;
  nozzles: AssignedNozzle[];
  terminals: AssignedTerminal[];
  handover?: RecordedHandover | null;
  terminalEntries?: RecordedTerminalEntry[];
  creditSales?: CreditLine[];
  omcSales?: CreditLine[];
}

/** The `/shifts/my-assignment` read. */
export interface MyAssignment {
  userId?: string;
  station?: { id?: string; name?: string } | null;
  shift?: {
    id?: string;
    templateName?: string | null;
    stationId?: string;
    openedAt?: string | null;
  } | null;
  stationHasConfiguredTerminals?: boolean;
  dispenserUnits?: AssignedDu[];
}

export interface DuFormState {
  readings: Record<string, string>; // nozzleId -> closing
  /**
   * nozzleId -> the attendant has entered or confirmed this closing reading.
   * The form seeds each closing from the opening reading, so "the field holds a
   * valid number" cannot tell an untouched nozzle from one that genuinely did
   * not move; this can.
   */
  confirmedReadings: Record<string, boolean>;
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
export function seedForm(du: AssignedDu): DuFormState {
  const readings: Record<string, string> = {};
  const confirmedReadings: Record<string, boolean> = {};
  const testing: Record<string, string> = {};
  for (const nz of du.nozzles) {
    readings[nz.nozzleId] = String(nz.closingReading ?? nz.openingReading ?? 0);
    // A closing the server already holds was entered in an earlier save.
    confirmedReadings[nz.nozzleId] = nz.closingReading != null;
    testing[nz.nozzleId] = blankZero(nz.testingVolume);
  }
  const terminals: TerminalState = {};
  for (const t of du.terminals) {
    const entry = (du.terminalEntries || []).find((e) => e.terminalId === t.terminalId);
    terminals[t.terminalId] = {
      card: blankZero(entry?.cardAmount),
      upi: blankZero(entry?.upiAmount),
      batch: entry?.batchRef ?? '',
    };
  }
  return {
    readings,
    confirmedReadings,
    testing,
    terminals,
    aggregateCard: du.terminals.length === 0 ? blankZero(du.handover?.cardHandedOver) : '',
    aggregateUpi: du.terminals.length === 0 ? blankZero(du.handover?.upiHandedOver) : '',
    cash: blankZero(du.handover?.cashHandedOver),
    drops: blankZero(du.handover?.cashDrops),
  };
}
