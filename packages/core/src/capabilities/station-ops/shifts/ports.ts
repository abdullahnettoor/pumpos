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

/** Drawer-relevant money totals for a shift (drawer reconciliation model). */
export interface ShiftReconciliationTotals {
  cashCollections: number;
  cardCollections: number;
  upiCollections: number;
  creditCollections: number;
  drawerExpenses: number;
  drawerSupplierPayments: number;
}

export interface ShiftReconciliationReader {
  totalsForShift(shiftId: string): Promise<ShiftReconciliationTotals>;
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
