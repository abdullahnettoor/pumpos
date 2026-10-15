import type { RecordHandoverResult } from '../../services/cloud.js';

/**
 * Patches for the full shift-status payload (`queryKeys.shiftStatus(stationId,
 * false)`, GET /shifts/status) from a write's own answer (#606).
 *
 * Every figure written here is one the server returned. What the answer does
 * not carry — the shift-level reconciliation totals, a Drawer's cash sales,
 * the customer-sale totals — is left to the background refetch, and a view
 * reading it while the patch awaits confirmation shows "Saving…".
 */

type Row = Record<string, unknown>;

/** The slices of the payload these patches touch; everything else passes through. */
export interface ShiftStatusSlice {
  activeShift?: ActiveShiftSlice | null;
  [key: string]: unknown;
}

export interface ActiveShiftSlice {
  id: string;
  nozzleReadings?: Row[];
  staffAssignments?: Row[];
  handovers?: Row[];
  reconciliation?: { drawers?: Row[] | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

const isDrawer = (row: Row, userKey: string, attendantId: string, duId: string) =>
  row[userKey] === attendantId && row.duId === duId;

/** The open shift, if the write landed on it; otherwise null (nothing to patch). */
function openShift(status: ShiftStatusSlice, shiftId: string): ActiveShiftSlice | null {
  const shift = status.activeShift;
  return shift && shift.id === shiftId ? shift : null;
}

/**
 * An accepted Handover (POST /shifts/handovers) on the shift board: the
 * Drawer's handover row (recorded, its declared cash and variance), its
 * nozzles' closing readings, and its row in the server reconciliation.
 */
export function withAcceptedHandover<T extends ShiftStatusSlice>(
  status: T,
  result: RecordHandoverResult,
): T {
  const accepted = result.handover;
  const shift = openShift(status, accepted.shiftId);
  if (!shift) return status;
  const { attendantId, duId } = accepted;

  // The status row names the Drawer holder `userId`; the answer, `attendantId`.
  // A first handover takes its labels and customer sales from the assignment,
  // which is where the server reads them from too.
  const handovers = shift.handovers ?? [];
  const previous = handovers.find((h) => isDrawer(h, 'userId', attendantId, duId));
  const assignment = (shift.staffAssignments ?? []).find((a) =>
    isDrawer(a, 'userId', attendantId, duId),
  );
  const carried: Row = previous ?? {
    attendantName: assignment?.userName ?? 'Attendant',
    duName: assignment?.duName ?? null,
    attributed: assignment?.attributed,
    creditSales: assignment?.creditSales ?? [],
    creditTotal: assignment?.creditTotal,
    omcSales: assignment?.omcSales ?? [],
    omcTotal: assignment?.omcTotal,
  };
  const { attendantId: _attendantId, ...columns } = accepted;
  const handover: Row = {
    ...carried,
    ...columns,
    userId: attendantId,
    terminalEntries: result.terminalEntries,
  };
  const nextHandovers = previous
    ? handovers.map((h) => (h === previous ? handover : h))
    : [...handovers, handover];

  const readings = new Map(result.nozzleReadings.map((r) => [r.nozzleId, r]));
  const nozzleReadings = (shift.nozzleReadings ?? []).map((row) => {
    const reading = readings.get(row.nozzleId as string);
    if (!reading || (row.id !== undefined && row.id !== reading.id)) return row;
    return {
      ...row,
      closingReading: String(reading.closingReading),
      volumeSold: String(reading.grossVolume),
      testingVolume: String(reading.testingVolume),
    };
  });

  const recon = shift.reconciliation;
  const reconciliation =
    recon && Array.isArray(recon.drawers)
      ? {
          ...recon,
          drawers: recon.drawers.map((d) =>
            isDrawer(d, 'attendantId', attendantId, duId)
              ? {
                  ...d,
                  openingFloat: result.openingFloat,
                  cashDrops: result.cashDrops,
                  expectedCash: result.expectedCash,
                  cashHandedOver: Number(accepted.cashHandedOver),
                  variance: result.varianceAmount,
                  // Derived on the server from the stored row; the refetch brings it.
                  cashSales: null,
                }
              : d,
          ),
        }
      : recon;

  return {
    ...status,
    activeShift: {
      ...shift,
      handovers: nextHandovers,
      nozzleReadings,
      reconciliation,
    },
  };
}

/** A fuel-on-credit or OMC card sale line as the status payload lists it. */
export interface CustomerSaleLine {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerType: string | null;
  vehicleId: string | null;
  productId: string | null;
  productName: string | null;
  productCode: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  notes: string | null;
}

/** What POST /transactions/collections answers for a Credit or OMC sale. */
export interface CustomerSaleEntry {
  id: string;
  shiftId: string;
  attendantId: string | null;
  duId: string | null;
  customerId: string | null;
  vehicleId: string | null;
  productId: string | null;
  transactionType: 'Credit Sale' | 'OMC Sale';
  amount: string | number;
  quantity: string | number | null;
  unitPrice: string | number | null;
  notes: string | null;
}

/** Labels the answer does not carry, from the records the operator picked. */
export interface CustomerSaleLabels {
  customerName: string | null;
  customerType: string | null;
  productName: string | null;
  productCode: string | null;
}

const numOrNull = (v: string | number | null | undefined) =>
  v == null || v === '' ? null : Number(v);

/** The status line for a recorded customer sale: figures from the answer, labels from the pick. */
export function customerSaleLine(
  entry: CustomerSaleEntry,
  labels: CustomerSaleLabels,
): CustomerSaleLine {
  return {
    id: entry.id,
    customerId: entry.customerId,
    customerName: labels.customerName,
    customerType: labels.customerType,
    vehicleId: entry.vehicleId,
    productId: entry.productId,
    productName: labels.productName,
    productCode: labels.productCode,
    quantity: numOrNull(entry.quantity),
    unitPrice: numOrNull(entry.unitPrice),
    amount: Number(entry.amount),
    notes: entry.notes,
  };
}

const listFor = (entry: CustomerSaleEntry) =>
  entry.transactionType === 'OMC Sale' ? 'omcSales' : 'creditSales';

/**
 * A recorded Credit / OMC card sale under its Drawer (assignment and, once it
 * has handed over, the handover). The Drawer totals are the server's and
 * arrive with the refetch.
 */
export function withCustomerSale<T extends ShiftStatusSlice>(
  status: T,
  entry: CustomerSaleEntry,
  labels: CustomerSaleLabels,
): T {
  const shift = openShift(status, entry.shiftId);
  if (!shift || !entry.attendantId || !entry.duId) return status;
  const list = listFor(entry);
  const line = customerSaleLine(entry, labels);
  let changed = false;
  const add = (row: Row) => {
    if (!isDrawer(row, 'userId', entry.attendantId!, entry.duId!)) return row;
    const lines = (row[list] as CustomerSaleLine[] | undefined) ?? [];
    if (lines.some((l) => l.id === line.id)) return row;
    changed = true;
    return { ...row, [list]: [...lines, line] };
  };
  const staffAssignments = (shift.staffAssignments ?? []).map(add);
  const handovers = (shift.handovers ?? []).map(add);
  return changed ? { ...status, activeShift: { ...shift, staffAssignments, handovers } } : status;
}

/** A voided Credit / OMC card sale leaves every Drawer's list (the void answers only its id). */
export function withoutCustomerSale<T extends ShiftStatusSlice>(
  status: T,
  shiftId: string,
  saleId: string,
): T {
  const shift = openShift(status, shiftId);
  if (!shift) return status;
  let changed = false;
  const drop = (row: Row) => {
    let next = row;
    for (const list of ['creditSales', 'omcSales'] as const) {
      const lines = row[list] as CustomerSaleLine[] | undefined;
      if (lines?.some((l) => l.id === saleId)) {
        next = { ...next, [list]: lines.filter((l) => l.id !== saleId) };
        changed = true;
      }
    }
    return next;
  };
  const staffAssignments = (shift.staffAssignments ?? []).map(drop);
  const handovers = (shift.handovers ?? []).map(drop);
  return changed ? { ...status, activeShift: { ...shift, staffAssignments, handovers } } : status;
}
