import type { DecantationFlag, DecantationWarning, DecantationFlagCode } from '@pump/shared';

export type { DecantationFlag, DecantationWarning, DecantationFlagCode };

/** DRAFT and PENDING_MEASUREMENT are set here; MEASURED is set by measurement (#468). */
export type DecantationStatus = 'DRAFT' | 'PENDING_MEASUREMENT' | 'MEASURED';
export type DecantationLineStatus = 'PENDING_MEASUREMENT' | 'MEASURED';
export type ChamberMark = 'OK' | 'SHORT' | 'EXCESS';

/** One tank filled during the visit. Quantities in litres, densities in kg/m³. */
export interface DecantationTankLine {
  id: string;
  decantationId: string;
  tankId: string;
  productId: string;
  beforeDip: number;
  beforeDipAt: string | null;
  observedDensity: number | null;
  observedTempC: number | null;
  /** RO Density at 15 °C. */
  roDensity: number | null;
  afterDip: number | null;
  afterDipAt: string | null;
  salesDuring: number;
  receivedQty: number | null;
  measuredBy: 'AFTER_DIP' | 'TANK_DIP' | null;
  measurementRefId: string | null;
  measuredAt: string | null;
  status: DecantationLineStatus;
}

export interface DecantationChamber {
  id: string;
  decantationId: string;
  tankLineId: string | null;
  chamberNo: number;
  capacityL: number | null;
  sealOk: boolean | null;
  mark: ChamberMark | null;
  dipMm: number | null;
  emptied: boolean | null;
}

/** One tanker visit with its tank lines and chambers. */
export interface Decantation {
  id: string;
  organizationId: string;
  stationId: string;
  businessDayId: string;
  /** Resolved by readers that join the Business Day. */
  businessDate?: string;
  documentNumber: string;
  tankerNumber: string;
  driverName: string | null;
  unloadStartedAt: string | null;
  unloadEndedAt: string | null;
  chambersChecked: boolean;
  status: DecantationStatus;
  flags: DecantationFlag[];
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
  lines: DecantationTankLine[];
  chambers: DecantationChamber[];
}

export interface DecantationListQuery {
  organizationId: string;
  stationId: string;
  /** Inclusive Business Date range (YYYY-MM-DD). */
  from?: string;
  to?: string;
  status?: DecantationStatus;
  limit?: number;
}

export interface DecantationRepository {
  findById(organizationId: string, id: string): Promise<Decantation | null>;
  /** Header + lines + chambers. */
  insert(decantation: Decantation): Promise<void>;
  /**
   * Update the header and replace lines + chambers (and the density readings that
   * reference those lines) with the aggregate's. Callers re-save density readings.
   */
  replace(decantation: Decantation): Promise<void>;
  list(query: DecantationListQuery): Promise<Decantation[]>;
  /**
   * Non-draft Decantations of a station with at least one PENDING_MEASUREMENT line
   * for `tankId`, oldest first (#468 tank-dip resolution).
   */
  findPendingForTank(
    organizationId: string,
    stationId: string,
    tankId: string,
  ): Promise<Decantation[]>;
  /**
   * Persist measurement only: after-dip fields, received/measured_* and status on
   * lines, plus the header status/flags/updated_at. Never touches chambers,
   * density readings or the other (sealed) fields (#468).
   */
  updateMeasurement(decantation: Decantation): Promise<void>;
}

/** Link of a Decantation to the Fuel Purchase invoice of one product (#469, D5). */
export interface DecantationPurchaseLink {
  id: string;
  organizationId: string;
  stationId: string;
  decantationId: string;
  purchaseId: string;
  productId: string;
  receivedQty: number | null;
  invoiceQty: number | null;
  /** received − invoice (+ Excess, − Short). Never netted across invoices. */
  varianceQty: number | null;
  varianceComputedAt: string | null;
}

export interface DecantationPurchaseRepository {
  listForPurchaseProduct(
    organizationId: string,
    purchaseId: string,
    productId: string,
  ): Promise<DecantationPurchaseLink[]>;
  listForDecantation(
    organizationId: string,
    decantationId: string,
  ): Promise<DecantationPurchaseLink[]>;
  /** Persist received/invoice/variance fields of an existing link. */
  updateVariance(link: DecantationPurchaseLink): Promise<void>;
  /** Σ quantity and Σ quantity × unit price of the purchase's lines of a product. */
  invoiceLine(
    organizationId: string,
    purchaseId: string,
    productId: string,
  ): Promise<{ quantity: number; value: number } | null>;
}

/** Litres dispensed from a tank, as booked by closed shifts. */
export interface TankSalesReader {
  /** Σ −quantity of `Sale` movements of the tank with created_at in (from, to]. */
  litresSoldBetween(tankId: string, fromIso: string, toIso: string): Promise<number>;
}

export interface DensityReading {
  id: string;
  organizationId: string;
  stationId: string;
  businessDate: string;
  productId: string;
  kind: 'MORNING' | 'ADHOC' | 'DECANTATION';
  sampledFrom: 'NOZZLE' | 'TANK' | null;
  tankId: string | null;
  nozzleId: string | null;
  entryMethod: 'HYDROMETER' | 'DIRECT_15';
  observedDensity: number | null;
  observedTempC: number | null;
  density15: number;
  decantationTankLineId: string | null;
  flags: unknown[];
  recordedBy: string | null;
  recordedAt: string;
}

export interface DensityReadingRepository {
  saveMany(readings: DensityReading[]): Promise<void>;
}
