import type {
  CollectionEntryFormValues,
  ExpenseEntryFormValues,
  PurchaseEntryFormValues,
  SupplierPaymentEntryFormValues,
} from '@pump/shared';
import { methodUsesTerminal } from './fundingAccounts.js';

/**
 * Request bodies for Office Records (ADR 0005): station + entry date + funding
 * account. No shift, no business day.
 */
export function expensePayload(stationId: string, v: ExpenseEntryFormValues) {
  return {
    stationId,
    entryDate: v.entryDate || undefined,
    fundingAccountId: v.fundingAccountId,
    categoryId: v.categoryId,
    amount: Number(v.amount),
    description: v.description || undefined,
  };
}

/** Other income uses the same form values as an expense. */
export const incomePayload = expensePayload;

export function collectionPayload(stationId: string, v: CollectionEntryFormValues) {
  const terminalId = methodUsesTerminal(v.paymentMethod) && v.terminalId ? v.terminalId : undefined;
  return {
    stationId,
    entryDate: v.entryDate || undefined,
    // With a terminal the server posts to its clearing account.
    fundingAccountId: terminalId ? undefined : v.fundingAccountId || undefined,
    terminalId,
    customerId: v.customerId || undefined,
    amount: Number(v.amount),
    paymentMethod: v.paymentMethod,
    notes: v.notes || undefined,
  };
}

/** `POST /transactions/supplier-payments`: station, Entry Date, the account paid from; never a shift. */
export function supplierPaymentPayload(stationId: string, v: SupplierPaymentEntryFormValues) {
  return {
    stationId,
    entryDate: v.entryDate || undefined,
    fundingAccountId: v.fundingAccountId,
    supplierId: v.supplierId,
    amount: Number(v.amount),
    notes: v.notes || undefined,
  };
}

/** "Also record a supplier payment now": a separate Supplier payment saved with the purchase. */
export interface PurchasePayNow {
  amount: number;
  fundingAccountId: string;
  entryDate?: string;
  notes?: string;
}

/**
 * `POST /transactions/purchases`. Fuel is dated by its invoice (an Entry Date),
 * products by their Business Date; the server tells them apart. A pay-now rides
 * in the same request so the purchase and its payment save atomically.
 */
export function purchasePayload(
  stationId: string,
  v: PurchaseEntryFormValues,
  payment?: PurchasePayNow,
) {
  return {
    stationId,
    transactionDate: v.transactionDate || undefined,
    supplierId: v.supplierId,
    invoiceNumber: v.invoiceNumber || undefined,
    notes: v.notes || undefined,
    lines: v.lines.map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      invoiceDensity: l.invoiceDensity === '' ? undefined : l.invoiceDensity,
    })),
    payment: payment && payment.amount > 0 ? payment : undefined,
  };
}
