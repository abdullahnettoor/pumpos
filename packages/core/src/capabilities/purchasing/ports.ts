export interface Purchase {
  id: string;
  documentNumber: string;
  shiftId: string | null;
  businessDayId: string;
  supplierId: string;
  invoiceNumber: string | null;
  amount: string;
  notes: string | null;
  createdAt: string;
}

export interface PurchaseRepository {
  save(purchase: Purchase): Promise<void>;
}

export type SupplierTransactionType = 'Purchase' | 'Payment' | 'Adjustment';

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
