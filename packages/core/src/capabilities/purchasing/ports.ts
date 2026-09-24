export interface Purchase {
  id: string;
  documentNumber: string;
  shiftId: string | null;
  businessDayId: string;
  supplierId: string;
  invoiceNumber: string | null;
  amount: string;
  taxableAmount: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  vatTotal: string;
  cessTotal: string;
  notes: string | null;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  taxCategory: string;
  gstRate: string | null;
  vatRate: string | null;
  cessRate: string | null;
  hsnCode: string | null;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  vat: string;
  cess: string;
  lineTotal: string;
  tankAllocations: { tankId: string; quantity: number }[] | null;
  createdAt: string;
}

export interface PurchaseRepository {
  save(purchase: Purchase): Promise<void>;
}

export interface PurchaseItemRepository {
  saveMany(items: PurchaseItem[]): Promise<void>;
}

export type SupplierTransactionType = 'Purchase' | 'Payment' | 'Adjustment' | 'Opening Balance';

/**
 * A supplier-ledger row. Payments are Office Records (ADR 0005) and carry the
 * Funding Account the money left; payables (Purchase, Opening Balance) move no
 * money, so their Funding Account is null. `entryDate` is the Entry Date for a
 * payment and the Business Date for a purchase payable.
 */
export interface SupplierTransaction {
  id: string;
  organizationId: string;
  stationId: string;
  entryDate: string;
  supplierId: string;
  transactionType: SupplierTransactionType;
  amount: string;
  fundingAccountId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SupplierTransactionRepository {
  save(txn: SupplierTransaction): Promise<void>;
}
