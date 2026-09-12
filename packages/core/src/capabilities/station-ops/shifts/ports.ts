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
  openingCash: string;
  closingCash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAssignmentInput {
  userId: string;
  duId: string;
}

export interface TerminalLinkInput {
  terminalId: string;
  duId?: string | null;
}

export interface ShiftRepository extends Repository<Shift> {
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

export interface NozzleReadingRepository {
  /** Latest closing reading per nozzle across all prior shifts. */
  lastClosingByNozzleIds(nozzleIds: string[]): Promise<Map<string, number>>;
  saveMany(readings: NozzleReading[]): Promise<void>;
  listByShift(shiftId: string): Promise<NozzleReading[]>;
  updateClosing(id: string, closingReading: string, volumeSold: string): Promise<void>;
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
  attendant: { id: string; organizationId: string; fullName: string; role: string; status: string } | null;
  dispenser: { id: string; organizationId: string; stationId: string; name: string; code: string; status: string } | null;
  assigned: boolean;
  nozzleReadings: HandoverNozzleReading[];
  missingReadingNozzleIds: string[];
  terminals: HandoverTerminal[];
  creditSales: number;
  omcCardSales: number;
  merchandiseCash: number;
}

export interface HandoverContextReader {
  load(organizationId: string, stationId: string, shiftId: string, attendantId: string, duId: string): Promise<HandoverContext>;
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
  ): Promise<{ handover: AttendantHandover; terminalEntries: HandoverTerminalEntry[]; replaced: boolean }>;
  updateReadings(readings: AcceptedHandoverReading[]): Promise<void>;
}

/** Drawer-relevant money totals for a shift (drawer reconciliation model). */
export interface ShiftReconciliationTotals {
  cashSales: number;
  cashCollections: number;
  cardCollections: number;
  upiCollections: number;
  creditCollections: number;
  /** Indirect income received as drawer cash (adds to expected drawer). */
  cashIncome?: number;
  drawerExpenses: number;
  drawerSupplierPayments: number;
  /** Breakdown of cashSales (optional; for the closing cash summary). */
  handoverCash?: number;
  /** Merchandise cash from sellers with no handover (office/counter staff). */
  merchCashOutsideHandover?: number;
  /** Per-seller split of merchCashOutsideHandover (sums exactly to it). */
  merchCashOutsideHandoverBreakdown?: { sellerName: string; amount: number }[];
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
