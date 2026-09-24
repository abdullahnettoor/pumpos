import type { CollectionEntryFormValues, ExpenseEntryFormValues } from '@pump/shared';
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
