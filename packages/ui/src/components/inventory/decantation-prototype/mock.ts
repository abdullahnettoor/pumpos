// PROTOTYPE — throwaway. Decantation & Density milestone (#464–#473).
// In-memory mock data only; nothing here talks to the API.

export interface ProtoTank {
  id: string;
  name: string;
  product: 'MS' | 'HSD';
  capacity: number;
  bookStock: number;
}

export interface ProtoPurchase {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  supplier: string;
  product: 'MS' | 'HSD';
  qty: number;
  rate: number;
  invoiceDensity: number;
}

export type DecantationStatus = 'measured' | 'pending' | 'draft';

export interface ProtoDecantation {
  id: string;
  date: string;
  tankerNo: string;
  driver: string;
  tankId: string;
  product: 'MS' | 'HSD';
  purchaseId: string | null;
  beforeDip: number;
  roDensity: number;
  roTemp?: number;
  start: string;
  end: string;
  afterDip: number | null;
  salesDuring: number;
  status: DecantationStatus;
  received: number | null;
  sealOk: boolean;
}

export const SETTINGS = {
  densityTolerance: 3, // kg/m³
  qtyTolerancePct: 0.5,
  settlingMinutes: 30,
};

export const TANKS: ProtoTank[] = [
  { id: 't1', name: 'Tank 1', product: 'MS', capacity: 20000, bookStock: 6420 },
  { id: 't2', name: 'Tank 2', product: 'HSD', capacity: 20000, bookStock: 3180 },
  { id: 't3', name: 'Tank 3', product: 'HSD', capacity: 15000, bookStock: 9050 },
];

export const PURCHASES: ProtoPurchase[] = [
  {
    id: 'p1',
    invoiceNo: 'IOCL/24/88213',
    invoiceDate: '2026-10-09',
    supplier: 'Indian Oil Corporation',
    product: 'MS',
    qty: 12000,
    rate: 94.12,
    invoiceDensity: 745.2,
  },
  {
    id: 'p2',
    invoiceNo: 'IOCL/24/88302',
    invoiceDate: '2026-10-10',
    supplier: 'Indian Oil Corporation',
    product: 'HSD',
    qty: 12000,
    rate: 86.4,
    invoiceDensity: 832.6,
  },
  {
    id: 'p3',
    invoiceNo: 'IOCL/24/88417',
    invoiceDate: '2026-10-11',
    supplier: 'Indian Oil Corporation',
    product: 'HSD',
    qty: 8000,
    rate: 86.4,
    invoiceDensity: 831.9,
  },
];

export const INITIAL_DECANTATIONS: ProtoDecantation[] = [
  {
    id: 'd1',
    date: '2026-10-09',
    tankerNo: 'KL-07-CB-4412',
    driver: 'Suresh',
    tankId: 't1',
    product: 'MS',
    purchaseId: 'p1',
    beforeDip: 4210,
    roDensity: 744.8,
    start: '10:05',
    end: '10:40',
    afterDip: 16140,
    salesDuring: 0,
    status: 'measured',
    received: 11930,
    sealOk: true,
  },
  {
    id: 'd2',
    date: '2026-10-10',
    tankerNo: 'KL-07-CC-1190',
    driver: 'Anil',
    tankId: 't2',
    product: 'HSD',
    purchaseId: 'p2',
    beforeDip: 2950,
    roDensity: 837.1,
    start: '14:20',
    end: '14:58',
    afterDip: 14980,
    salesDuring: 0,
    status: 'measured',
    received: 12030,
    sealOk: true,
  },
  {
    id: 'd3',
    date: '2026-10-11',
    tankerNo: 'KL-07-CB-4412',
    driver: 'Suresh',
    tankId: 't3',
    product: 'HSD',
    purchaseId: null,
    beforeDip: 1080,
    roDensity: 832.2,
    start: '08:10',
    end: '08:36',
    afterDip: null,
    salesDuring: 0,
    status: 'pending',
    received: null,
    sealOk: true,
  },
];

export const tankById = (id: string) => TANKS.find((t) => t.id === id);
export const purchaseById = (id: string | null) =>
  id ? PURCHASES.find((p) => p.id === id) : undefined;

/** Received = after − before + sales during unloading. */
export const receivedQty = (before: number, after: number | null, sales: number) =>
  after == null ? null : after - before + sales;

export interface Flags {
  density: number | null; // RO − invoice
  densityOut: boolean;
  qtyDiff: number | null; // received − invoice
  qtyOut: boolean;
  unlinked: boolean;
  pending: boolean;
  sealIssue: boolean;
}

export const flagsFor = (d: ProtoDecantation, purchases = PURCHASES): Flags => {
  const p = d.purchaseId ? purchases.find((x) => x.id === d.purchaseId) : undefined;
  const density = p ? +(d.roDensity - p.invoiceDensity).toFixed(1) : null;
  const qtyDiff = p && d.received != null ? d.received - p.qty : null;
  return {
    density,
    densityOut: density != null && Math.abs(density) > SETTINGS.densityTolerance,
    qtyDiff,
    qtyOut:
      qtyDiff != null && p != null && Math.abs(qtyDiff) > (p.qty * SETTINGS.qtyTolerancePct) / 100,
    unlinked: !p,
    pending: d.status === 'pending',
    sealIssue: !d.sealOk,
  };
};

export const fmtL = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('en-IN')} L`;
export const fmtSigned = (n: number, unit: string) =>
  `${n > 0 ? '+' : ''}${n.toLocaleString('en-IN')} ${unit}`;
