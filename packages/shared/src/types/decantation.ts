/**
 * Wire shapes of the Decantation API (ADR 0007), shared by the desktop drawer
 * and list. The server stays authoritative: these mirror what
 * `/transactions/decantations` returns and accepts. Linking fields follow the
 * #469 contract (DECISIONS D8).
 */
import type { DecantationFlag, DecantationWarning } from '../utils/decantation-flags.js';

export type DecantationStatusView = 'DRAFT' | 'PENDING_MEASUREMENT' | 'MEASURED';
export type DecantationChamberMark = 'OK' | 'SHORT' | 'EXCESS';

export interface DecantationTankLineView {
  id: string;
  tankId: string;
  productId: string;
  beforeDip: number;
  beforeDipAt: string | null;
  observedDensity: number | null;
  observedTempC: number | null;
  /** RO Density at 15 °C (kg/m³). */
  roDensity: number | null;
  afterDip: number | null;
  afterDipAt: string | null;
  salesDuring: number;
  receivedQty: number | null;
  status: 'PENDING_MEASUREMENT' | 'MEASURED';
}

export interface DecantationChamberView {
  id: string;
  tankLineId: string | null;
  chamberNo: number;
  capacityL: number | null;
  sealOk: boolean | null;
  mark: DecantationChamberMark | null;
  dipMm: number | null;
  emptied: boolean | null;
}

/** The Fuel Purchase invoice linked to one product of a Decantation (#469). */
export interface DecantationLinkView {
  productId: string;
  purchaseId: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  invoiceQty: number | null;
  invoiceDensity: number | null;
  receivedQty: number | null;
  /** received − invoice: + Excess, − Short. */
  varianceQty: number | null;
  varianceComputedAt: string | null;
}

export interface DecantationView {
  id: string;
  stationId: string;
  businessDayId: string;
  businessDate?: string;
  documentNumber: string;
  tankerNumber: string;
  driverName: string | null;
  unloadStartedAt: string | null;
  unloadEndedAt: string | null;
  chambersChecked: boolean;
  status: DecantationStatusView;
  flags: DecantationFlag[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: DecantationTankLineView[];
  chambers: DecantationChamberView[];
  links?: DecantationLinkView[];
  /** Products with a tank line but no linked Fuel Purchase. */
  unlinkedProductIds?: string[];
}

/** A Fuel Purchase of one product that a Decantation can be linked to. */
export interface LinkablePurchase {
  purchaseId: string;
  documentNumber: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  entryDate: string;
  invoiceQty: number;
  invoiceDensity: number | null;
  linkedDecantationCount: number;
  awaitingDecantation: boolean;
}

export interface SaveDecantationLineBody {
  id?: string;
  tankId: string;
  beforeDip: number;
  beforeDipAt?: string;
  observedDensity?: number;
  observedTempC?: number;
  roDensity?: number;
  afterDip?: number;
  afterDipAt?: string;
  salesDuring?: number;
  invoiceDensity?: number;
}

export interface SaveDecantationChamberBody {
  chamberNo: number;
  capacityL?: number;
  sealOk?: boolean;
  mark?: DecantationChamberMark;
  dipMm?: number;
  emptied?: boolean;
  tankLineIndex?: number;
}

export interface SaveDecantationBody {
  stationId: string;
  tankerNumber: string;
  driverName?: string;
  unloadStartedAt?: string;
  unloadEndedAt?: string;
  chambersChecked: boolean;
  draft?: boolean;
  invoiceQuantity?: number;
  notes?: string;
  lines: SaveDecantationLineBody[];
  chambers?: SaveDecantationChamberBody[];
  /** One Fuel Purchase per product (#469). */
  links?: { productId: string; purchaseId: string }[];
}

export interface SaveDecantationResult {
  decantation: DecantationView;
  warnings: DecantationWarning[];
}
