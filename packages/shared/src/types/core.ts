export type Role = 'Owner' | 'Manager' | 'Accountant' | 'Staff';

export type ShiftState = 'OPEN' | 'CLOSED' | 'LOCKED';

export type SyncStatus = 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED';

export type DocumentType = 'SALE' | 'PURCHASE' | 'COLLECTION';

export type ProductType = 'FUEL' | 'LUBRICANT' | 'ADDITIVE' | 'ACCESSORY' | 'CONSUMABLE' | 'SPARE_PART' | 'SERVICE' | 'OTHER';

export type InventoryType = 'BULK' | 'ITEM' | 'NONE';

export type CustomerType = 'Regular' | 'Credit' | 'Fleet';

export type TransactionType = 'Credit Sale' | 'Collection' | 'Adjustment' | 'Purchase' | 'Payment';

export type MovementType = 'Purchase' | 'Sale' | 'Adjustment' | 'Decantation' | 'Variance' | 'OpeningBalance';

export type ExpenseStatus = 'ACTIVE' | 'ADJUSTMENT' | 'VOIDED';

export type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type EventType =
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'SHIFT_LOCKED'
  | 'NOZZLE_READINGS_RECORDED'
  | 'TRANSACTION_RECORDED'
  | 'SYNC_EVENT';

export interface CoreError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: CoreError };
