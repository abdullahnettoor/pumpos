import type { Repository } from '../../../kernel/index.js';

export type ShiftStatus = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface Shift {
  id: string;
  organizationId: string;
  stationId: string;
  businessDayId: string;
  shiftTemplateId: string;
  status: ShiftStatus;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  lockedAt: string | null;
  /**
   * Read-only: the sum of the Shift's Opening Floats (ADR 0005, #278). Not
   * stored on the shift; adapters derive it from the staff assignments.
   */
  openingCash: string;
  closingCash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAssignmentInput {
  userId: string;
  duId: string;
  /** Change money issued to this Attendant's Drawer at open; 0 allowed. */
  openingFloat?: number;
}

export interface TerminalLinkInput {
  terminalId: string;
  duId?: string | null;
}

export interface ShiftRepository extends Repository<Shift> {
  /** Discovery read before Station -> Business Day -> Shift locks are acquired. */
  findByIdWithoutLock(id: string): Promise<Shift | null>;
  findOpenByStation(organizationId: string, stationId: string): Promise<Shift | null>;
  addStaffAssignments(shiftId: string, assignments: StaffAssignmentInput[]): Promise<void>;
  addTerminalLinks(shiftId: string, links: TerminalLinkInput[]): Promise<void>;
}

export interface NozzleReading {
  id: string;
  shiftId: string;
  nozzleId: string;
  openingReading: string;
  closingReading: string;
  volumeSold: string;
  /** Calibration/testing volume dispensed and returned to the tank (not a sale). */
  testingVolume: string;
  unitPrice: string | null;
  createdAt: string;
}

export interface NozzleClosingUpdate {
  id: string;
  closingReading: string;
  volumeSold: string;
}

export interface NozzleReadingRepository {
  /** Latest closing reading per nozzle across all prior shifts. */
  lastClosingByNozzleIds(nozzleIds: string[]): Promise<Map<string, number>>;
  saveMany(readings: NozzleReading[]): Promise<void>;
  listByShift(shiftId: string): Promise<NozzleReading[]>;
  /** Apply closing readings in ONE statement — never a per-nozzle loop (#229). */
  updateClosingMany(updates: NozzleClosingUpdate[]): Promise<void>;
}

export interface HandoverNozzleReading extends NozzleReading {
  organizationId: string;
  stationId: string;
  duId: string;
  nozzleName: string;
}

export interface HandoverTerminal {
  id: string;
  organizationId: string;
  stationId: string;
  label: string;
  supportsCard: boolean;
  supportsUpi: boolean;
  isActive: boolean;
  linkedDuId: string | null;
}

export interface HandoverContext {
  attendant: {
    id: string;
    organizationId: string;
    fullName: string;
    role: string;
    status: string;
  } | null;
  dispenser: {
    id: string;
    organizationId: string;
    stationId: string;
    name: string;
    code: string;
    status: string;
  } | null;
  assigned: boolean;
  /** This Attendant/DU Drawer's Opening Float (0 when unassigned). */
  openingFloat: number;
  nozzleReadings: HandoverNozzleReading[];
  missingReadingNozzleIds: string[];
  terminals: HandoverTerminal[];
  creditSales: number;
  omcCardSales: number;
  merchandiseCash: number;
}

export interface HandoverContextReader {
  load(
    organizationId: string,
    stationId: string,
    shiftId: string,
    attendantId: string,
    duId: string,
  ): Promise<HandoverContext>;
}

export interface AttendantHandover {
  id: string;
  organizationId: string;
  stationId: string;
  shiftId: string;
  attendantId: string;
  duId: string;
  cashHandedOver: string;
  cardHandedOver: string;
  upiHandedOver: string;
  creditHandedOver: string;
  testingVolume: string;
  expectedSales: string;
  /** Drawer Reconciliation inputs (ADR 0005, #278). */
  openingFloat: string;
  cashDrops: string;
  /** openingFloat + DU cash sales − cashDrops. */
  expectedCash: string;
  /** cashHandedOver − expectedCash. */
  varianceAmount: string;
  createdAt: string;
}

export interface HandoverTerminalEntry {
  id: string;
  handoverId: string;
  terminalId: string;
  duId: string;
  cardAmount: string;
  upiAmount: string;
  batchRef: string | null;
  createdAt: string;
}

export interface AcceptedHandoverReading {
  id: string;
  nozzleId: string;
  openingReading: number;
  closingReading: number;
  grossVolume: number;
  testingVolume: number;
  netVolume: number;
  unitPrice: number;
  expectedSales: number;
}

export interface HandoverRepository {
  replaceCurrent(
    handover: AttendantHandover,
    terminalEntries: HandoverTerminalEntry[],
  ): Promise<{
    handover: AttendantHandover;
    terminalEntries: HandoverTerminalEntry[];
    replaced: boolean;
  }>;
  updateReadings(readings: AcceptedHandoverReading[]): Promise<void>;
}

/**
 * Drawer-relevant money totals for a shift. Only cash sales touch a Drawer:
 * Office Records (collections, expenses, income, supplier payments) carry no
 * Shift and never enter the reconciliation (ADR 0005).
 */
export interface ShiftReconciliationTotals {
  /** True cash sales (Opening Floats excluded; Cash Drops added back). */
  cashSales: number;
  /** Σ Opening Floats: the Shift's opening cash. */
  openingFloat: number;
  /** Σ Cash Drops recorded on the Shift's Handovers. */
  handoverCashDrops: number;
  /** One Drawer per Attendant/DU assignment. */
  drawers: DrawerReconciliation[];
  /** Breakdown of cashSales (optional; for the closing cash summary). */
  handoverCash?: number;
  /** Merchandise cash from sellers with no handover (office/counter staff). */
  merchCashOutsideHandover?: number;
  /** Per-seller split of merchCashOutsideHandover (sums exactly to it). */
  merchCashOutsideHandoverBreakdown?: { sellerName: string; amount: number }[];
}

/** One Attendant's Drawer at Handover (ADR 0005, #278). */
export interface DrawerReconciliation {
  attendantId: string;
  attendantName: string | null;
  duId: string;
  duName: string | null;
  openingFloat: number;
  /** Null until the Attendant hands over. */
  cashSales: number | null;
  cashDrops: number;
  expectedCash: number | null;
  cashHandedOver: number | null;
  /** Attendant variance: declared + drops − expected. Null until handed over. */
  variance: number | null;
  /** Drops at close naming this Drawer (#287); set on the close snapshot only. */
  closeCashDrops?: number;
}

export interface ShiftReconciliationReader {
  totalsForShift(shiftId: string): Promise<ShiftReconciliationTotals>;
}

export interface CreditSaleRecord {
  id: string;
  amount: number;
  quantity: number | null;
  unitPrice: number | null;
  notes: string | null;
  duId: string | null;
  attendantId: string | null;
  customerId: string;
  vehicleId: string | null;
  productId: string | null;
  customerName: string;
  productName: string | null;
  productCode: string | null;
  vehicleNumber: string | null;
}

export interface CreditSalesReader {
  listByShift(shiftId: string): Promise<CreditSaleRecord[]>;
}

/**
 * Everything CloseShift needs to READ, in one round-trip (#229): the shift row
 * (locked FOR UPDATE), its nozzle readings, the station's nozzles, the drawer
 * reconciliation totals, and the shift's credit sales. The previous five
 * port reads each cost a round-trip while the station advisory lock was held.
 */
export interface CloseShiftContext {
  shift: Shift | null;
  readings: NozzleReading[];
  nozzles: { id: string; productId: string; tankId: string | null }[];
  totals: ShiftReconciliationTotals;
  creditSales: CreditSaleRecord[];
}

export interface CloseShiftContextReader {
  load(organizationId: string, shiftId: string): Promise<CloseShiftContext>;
}

export interface StockMovementInput {
  shiftId: string | null;
  businessDayId: string;
  productId: string;
  tankId: string | null;
  movementType: string;
  quantity: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface StockMovementWriter {
  saveMany(movements: StockMovementInput[]): Promise<void>;
}

export interface ShiftSummaryWriter {
  save(shiftId: string, snapshot: Record<string, unknown>): Promise<void>;
  deleteForShift(shiftId: string): Promise<void>;
}

/** Read+write access to the stored immutable shift-summary snapshot. */
export interface ShiftSummaryStore extends ShiftSummaryWriter {
  findByShift(shiftId: string): Promise<Record<string, unknown> | null>;
}

/**
 * Enriches a core snapshot into the full presentation shape (nozzle/handover
 * names, transaction lists, per-terminal rollups). Implemented by the API's
 * read-model projection; core stays SQL-free. Must be idempotent: projecting
 * an already-projected snapshot yields the same result.
 */
export interface ShiftSummaryProjector {
  project(shift: Shift, baseSnapshot: Record<string, unknown>): Promise<Record<string, unknown>>;
}
