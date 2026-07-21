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

export interface SupplierTransaction {
  id: string;
  shiftId: string | null;
  businessDayId: string;
  supplierId: string;
  transactionType: SupplierTransactionType;
  amount: string;
  paidFrom: string; // 'SHIFT_CASH' | 'BANK' | 'OWNER'
  affectsDrawer: boolean;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SupplierTransactionRepository {
  save(txn: SupplierTransaction): Promise<void>;
}
