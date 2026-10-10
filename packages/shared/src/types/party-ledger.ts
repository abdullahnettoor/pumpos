/**
 * Ranged party ledger wire contract (`GET /transactions/customers/:id/ledger?from=&to=`).
 *
 * Money is a decimal string (numeric(12,2) text, never a float); dates are
 * `YYYY-MM-DD` (a sale's Business Date, a Collection's Entry Date). A Credit Sale
 * carries its Shift, product, quantity and Vehicle; a Collection its method and
 * reference. Fields a row does not have are null.
 */
export interface PartyLedgerEntry {
  id: string;
  /** 'Credit Sale' | 'Collection' | 'Adjustment' | 'Opening Balance' (customer); 'Purchase' | 'Payment' | ... (supplier). */
  transactionType: string;
  amount: string;
  businessDate: string;
  /** Balance right after this row, over the whole ledger (period opening balance + running sum). */
  runningBalance: string;
  notes: string | null;
  createdAt: string;
  shiftId?: string | null;
  /** Business Date and 1-based position of the row's Shift: together its Shift Label. */
  shiftBusinessDate?: string | null;
  shiftSequence?: number | null;
  productName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  vehicleRegistration?: string | null;
  method?: string | null;
  reference?: string | null;
  fundingAccountName?: string | null;
}

export interface RangedPartyLedger {
  /** What was owed just before `from`. */
  periodOpeningBalance: string;
  /** What is owed after the last row of the range. */
  closingBalance: string;
  /** Oldest first. */
  entries: PartyLedgerEntry[];
}
