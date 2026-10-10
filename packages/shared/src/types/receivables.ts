import type { SettlementCycle } from './entities.js';

/**
 * Receivables summary wire contract (`GET /api/reports/receivables`,
 * `GET /api/reports/receivables/:customerId`).
 *
 * What customers owe, how old it is, and how they pay. The figures come from the
 * customer ledger, settled FIFO (CONTEXT.md "Receivable aging"): a Collection or
 * a credit Adjustment settles the oldest open debit first, and what is left of
 * each debit is aged from its Business Date to the Current Business Date. The
 * mobile Money tab renders exactly what the API returns and calculates nothing.
 */

/**
 * Age edges of the aging buckets, in whole days between a debit's Business Date
 * and the Current Business Date: `0-7`, `8-30`, `30+` (31 days and older).
 */
export const RECEIVABLES_AGING_EDGES = { recentMaxDays: 7, midMaxDays: 30 } as const;

/** Credit Sales a customer needs settled before "usually pays in N days" is shown. */
export const RECEIVABLES_MIN_SETTLED_SALES = 3;
/** The most recent settled Credit Sales "usually pays in" averages over. */
export const RECEIVABLES_SETTLED_SAMPLE = 6;
/** Customers the list returns (largest balance first); totals still cover everyone. */
export const RECEIVABLES_CUSTOMER_LIMIT = 500;
/** Vehicles the customer page lists (largest spend first). */
export const RECEIVABLES_VEHICLE_LIMIT = 20;

/** The open (unpaid) part of the debits, split by how old each debit is. */
export interface ReceivablesAging {
  /** Debits 0-7 days old. */
  d0_7: number;
  /** Debits 8-30 days old. */
  d8_30: number;
  /** Debits older than 30 days. */
  d30plus: number;
}

/** One customer's open receivable. Only customers that owe are listed. */
export interface CustomerReceivable {
  customerId: string;
  /** What they owe now (Σ open debits); never negative: an advance is not a receivable. */
  balance: number;
  /** Business Date of the oldest debit that is still (partly) open. */
  oldestUnpaidDate: string | null;
  /** Days from `oldestUnpaidDate` to the Current Business Date. */
  oldestUnpaidDays: number | null;
  aging: ReceivablesAging;
}

/** `GET /reports/receivables?stationId=` */
export interface ReceivablesSummary {
  /** Σ of every customer's open receivable. */
  total: number;
  /** Customers that owe. */
  customerCount: number;
  aging: ReceivablesAging;
  /** Largest balance first, at most `RECEIVABLES_CUSTOMER_LIMIT`. */
  customers: CustomerReceivable[];
}

export interface CustomerLastPayment {
  amount: number;
  /** Entry Date of the Collection. */
  entryDate: string;
  method: string;
  /** Whole calendar days from `entryDate` to today's Entry Date (the station calendar date, no Day Start). */
  daysAgo: number;
}

export interface CustomerMonthFigures {
  /** Credit Sales taken this month (by Business Date). */
  credit: number;
  /** Credit Sale slips this month. */
  slips: number;
  /** Fuel litres on those slips (products sold in litres only). */
  litres: number;
  /** Collections received this month (by Entry Date). */
  paid: number;
}

export interface CustomerVehicleSpend {
  vehicleId: string;
  registration: string;
  type: string;
  /** Credit Sales linked to the vehicle this month. */
  amount: number;
  litres: number;
}

/** `GET /reports/receivables/:customerId?stationId=` */
export interface CustomerReceivableSummary extends CustomerReceivable {
  /** How the customer settles: 'OPEN' running account, 'EOD' by end of the Business Day. */
  settlementCycle: SettlementCycle;
  lastPayment: CustomerLastPayment | null;
  /**
   * Mean days to settle their last `RECEIVABLES_SETTLED_SAMPLE` settled Credit Sales;
   * null with fewer than `RECEIVABLES_MIN_SETTLED_SALES`.
   */
  usuallyPaysInDays: number | null;
  month: CustomerMonthFigures;
  vehicles: CustomerVehicleSpend[];
}
