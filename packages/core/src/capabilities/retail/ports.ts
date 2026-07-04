export type SaleType = 'Fuel' | 'Product' | 'Mixed';
export type SaleCaptureMechanism = 'POS' | 'READING' | 'MERCH_HANDOVER';
export type SalePaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Credit';

/** Ad-hoc buyer bill-to for a walk-in sale not linked to a saved customer. */
export interface SaleBuyerDetails {
  name: string;
  phone?: string | null;
  gstin?: string | null;
  stateCode?: string | null;
}

export interface SaleLine {
  id: string;
  saleId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  documentNumber: string;
  shiftId: string;
  businessDayId: string;
  saleType: SaleType;
  captureMechanism: SaleCaptureMechanism;
  paymentMethod: SalePaymentMethod;
  customerId: string | null;
  vehicleId: string | null;
  /** Operator who made the sale (attendant accountability); null for back-office entries. */
  attendantId: string | null;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  /** Portion of a cash-recorded sale actually paid by card/UPI (Option B). */
  nonCashAmount?: string;
  /** Ad-hoc (unsaved) buyer bill-to, present only when customerId is null. */
  buyerDetails?: SaleBuyerDetails | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleRepository {
  save(sale: Sale, lines: SaleLine[]): Promise<void>;
}

/**
 * Replace semantics for the per-employee walk-in "merchandise handover" sale
 * (captureMechanism = MERCH_HANDOVER). Editing before shift close deletes the
 * prior sale + its items + stock movements, then a fresh one is saved.
 */
export interface MerchandiseHandoverRepository {
  /** Existing merchandise-handover sale id for this shift + attendant, if any. */
  findHandoverSaleId(shiftId: string, attendantId: string): Promise<string | null>;
  /** Physically remove a handover sale, its line items and its stock movements. */
  deleteHandoverSale(saleId: string): Promise<void>;
}
