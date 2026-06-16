import {
  Role,
  ShiftState,
  SyncStatus,
  DocumentType,
  ProductType,
  CustomerType,
  TransactionType,
  MovementType,
  ExpenseStatus,
} from './core.js';

export interface BaseMetadata {
  id: string;
  organizationId: string;
  stationId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  version: number;
}

export interface Organization {
  id: string;
  name: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface Station {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  settings: {
    shift_grace_minutes: number;
    offline_warning_days: number;
    offline_critical_days: number;
  };
  onboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY_FOR_OPERATIONS';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSequence {
  id: string;
  organizationId: string;
  documentType: DocumentType;
  currentNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  authUserId?: string | null; // Supabase auth user reference
  fullName: string;
  email: string;
  phone?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  id: string;
  userId: string;
  role: Role;
  createdAt: string;
}

export interface UserStationAssignment {
  id: string;
  userId: string;
  stationId: string;
  createdAt: string;
}

export interface Tank {
  id: string;
  organizationId: string;
  stationId: string;
  name: string;
  productId: string;
  capacity: number; // in Liters
  createdAt: string;
  updatedAt: string;
}

export interface DispenserUnit {
  id: string;
  organizationId: string;
  stationId: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Nozzle {
  id: string;
  organizationId: string;
  stationId: string;
  duId: string;
  tankId: string;
  productId: string;
  name: string;
  currentReading: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  productType: ProductType;
  stockTracked: boolean;
  isTaxable: boolean;
  unit: string;
  taxConfig: {
    gst_rate?: number;
    hsn_code?: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftTemplate {
  id: string;
  organizationId: string;
  name: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  isActive: boolean;
}

export interface Shift {
  id: string;
  organizationId: string;
  stationId: string;
  shiftTemplateId: string;
  status: ShiftState;
  openedBy: string;
  openedAt: string;
  closedBy?: string | null;
  closedAt?: string | null;
  lockedAt?: string | null;
  openingCash: number;
  closingCash?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftStaffAssignment {
  id: string;
  shiftId: string;
  userId: string;
  duId: string;
  assignedAt: string;
}

export interface NozzleReading {
  id: string;
  shiftId: string;
  nozzleId: string;
  openingReading: number;
  closingReading: number;
  volumeSold: number;
  createdAt: string;
}

export interface Customer {
  id: string;
  organizationId: string;
  stationId?: string | null;
  customerType: CustomerType;
  name: string;
  phone?: string | null;
  creditLimit?: number | null;
  fleetCode?: string | null;
  metadata?: Record<string, any> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTransaction {
  id: string;
  shiftId: string;
  customerId: string;
  transactionType: TransactionType;
  amount: number;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Supplier {
  id: string;
  organizationId: string;
  stationId?: string | null;
  name: string;
  phone?: string | null;
  metadata?: {
    gst_number?: string;
    vendor_code?: string;
  } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTransaction {
  id: string;
  shiftId: string;
  supplierId: string;
  transactionType: TransactionType;
  amount: number;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Sale {
  id: string;
  documentNumber: string;
  shiftId: string;
  saleType: 'Fuel' | 'Product' | 'Mixed' | 'Credit';
  customerId?: string | null;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  lineTotal: number;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  shiftId: string;
  productId: string;
  movementType: MovementType;
  quantity: number; // Positive for additions, negative for reductions
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface StockVariance {
  id: string;
  shiftId: string;
  productId: string;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  reason?: string | null;
  approvedBy?: string | null;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  organizationId: string;
  name: string;
  isSystem: boolean;
}

export interface Expense {
  id: string;
  shiftId: string;
  categoryId: string;
  amount: number;
  description?: string | null;
  parentExpenseId?: string | null;
  adjustmentReason?: string | null;
  status: ExpenseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  documentNumber: string;
  shiftId: string;
  customerId: string;
  amount: number;
  paymentMethod: string;
  notes?: string | null;
  createdAt: string;
}

export interface Purchase {
  id: string;
  documentNumber: string;
  shiftId: string;
  supplierId: string;
  invoiceNumber?: string | null;
  amount: number;
  notes?: string | null;
  createdAt: string;
}

export interface DssrSnapshot {
  id: string;
  shiftId: string;
  snapshotData: Record<string, any>;
  generatedAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  stationId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeData?: Record<string, any> | null;
  afterData?: Record<string, any> | null;
  performedBy: string;
  performedAt: string;
}

export interface BusinessEvent {
  id: string;
  eventId: string;
  eventType: string;
  organizationId: string;
  stationId?: string | null;
  entityType: string;
  entityId: string;
  payload: Record<string, any>;
  occurredAt: string;
}

export interface SyncEvent {
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, any>;
  status: SyncStatus;
  retryCount: number;
  createdAt: string;
  syncedAt?: string | null;
}
