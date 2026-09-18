export type Role = 'Owner' | 'Manager' | 'Accountant' | 'Staff' | 'Attendant';

export type ShiftState = 'OPEN' | 'CLOSED' | 'LOCKED';

export type SyncStatus = 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED';

export type DocumentType = 'SALE' | 'PURCHASE' | 'COLLECTION';

export type ProductType =
  | 'FUEL'
  | 'LUBRICANT'
  | 'ADDITIVE'
  | 'ACCESSORY'
  | 'CONSUMABLE'
  | 'SPARE_PART'
  | 'SERVICE'
  | 'OTHER';

/**
 * Tax treatment of a product:
 * - FUEL_VAT: petrol/diesel etc. — state VAT, outside GST (no input credit).
 * - GST: lubricants/merchandise/services — CGST+SGST (intra) or IGST (inter).
 * - EXEMPT: GST-exempt good.
 * - NON_TAXABLE: no tax applies.
 */
export type TaxCategory = 'FUEL_VAT' | 'GST' | 'EXEMPT' | 'NON_TAXABLE';

/**
 * The persisted tax configuration for a product, shaped to match its
 * {@link TaxCategory}: `GST` uses `gst_rate`/`cess`, `FUEL_VAT` uses `vat_rate`;
 * both may carry an `hsn_code`. This is the single canonical shape — the product
 * entity, the onboarding draft, and core's create/update commands all reference
 * it rather than re-declaring their own copies.
 */
export interface ProductTaxConfig {
  gst_rate?: number;
  vat_rate?: number;
  hsn_code?: string;
  cess?: number;
  /** Selling price is tax-inclusive (retail MRP); tax is extracted, not added. */
  price_inclusive?: boolean;
}

/** Curated units of measure so the value is system-decided, not free text.
 * Scoped to what a fuel station actually sells: fuels (L / kg), lubricants &
 * additives (L / ml / Bottle / Can), countable merchandise (Nos / Packet), and
 * labour (Service). */
export const PRODUCT_UNITS = [
  { value: 'L', label: 'Liters (L)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'ml', label: 'Milliliters (ml)' },
  { value: 'Nos', label: 'Numbers / Pieces (Nos)' },
  { value: 'Bottle', label: 'Bottle' },
  { value: 'Can', label: 'Can' },
  { value: 'Packet', label: 'Packet' },
  { value: 'Service', label: 'Service / Job' },
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number]['value'];

export type InventoryType = 'BULK' | 'ITEM' | 'NONE';

export type CustomerType = 'Regular' | 'Credit' | 'Fleet';

export type TransactionType = 'Credit Sale' | 'Collection' | 'Adjustment' | 'Purchase' | 'Payment';

export type MovementType =
  'Purchase' | 'Sale' | 'Adjustment' | 'Decantation' | 'Variance' | 'OpeningBalance';

export type ExpenseStatus = 'ACTIVE' | 'ADJUSTMENT' | 'VOIDED';

export type Weekday =
  'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

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

export type Result<T> = { success: true; data: T } | { success: false; error: CoreError };
