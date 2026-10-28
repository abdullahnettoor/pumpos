import type {
  CustomerLastPayment,
  CustomerMonthFigures,
  CustomerVehicleSpend,
  ReceivablesAging,
  SettlementCycle,
} from '@pump/shared';

/**
 * Receivables summary: source data ports.
 *
 * The reader settles every customer's ledger oldest-debit-first IN THE DATABASE
 * (a running sum of debits per customer against the total credits) and hands
 * core small, already-aggregated rows. Core never sees a ledger and never loops
 * over one: what it does here is bounded by the customers returned, not by how
 * many entries they have.
 */

/**
 * Receivables are Organization-wide: a customer and its balance belong to the
 * Organization (like the customers list's `currentBalance`), so a query names no
 * Station. The Station only gates access (the route) and supplies the clock.
 */
export interface ReceivablesQuery {
  organizationId: string;
  /** The Current Business Date (station timezone + Day Start): the "now" an age is measured to. */
  currentBusinessDate: string;
}

/** One customer's open receivable, as the database settled it. */
export interface ReceivableSourceRow {
  customerId: string;
  balance: number;
  oldestUnpaidDate: string | null;
  aging: ReceivablesAging;
}

export interface ReceivablesSource {
  /** Aging and count over EVERY customer that owes, not only the rows returned. */
  aging: ReceivablesAging;
  customerCount: number;
  /** Customers that owe, largest balance first, already capped by the reader. */
  customers: ReceivableSourceRow[];
}

export interface CustomerReceivableQuery extends ReceivablesQuery {
  customerId: string;
  /** Credit Sales of this Business Date range are "this month" (inclusive). */
  creditFrom: string;
  creditTo: string;
  /** Collections of this Entry Date range are "this month" (inclusive). */
  paidFrom: string;
  paidTo: string;
}

export interface CustomerReceivableSource {
  settlementCycle: SettlementCycle;
  receivable: ReceivableSourceRow;
  lastPayment: Omit<CustomerLastPayment, 'daysAgo'> | null;
  /** Their most recent settled Credit Sales: how many (up to the sample size) and the mean days to settle. */
  settled: { count: number; meanDays: number };
  month: CustomerMonthFigures;
  vehicles: CustomerVehicleSpend[];
}

export interface ReceivablesReader {
  summary(query: ReceivablesQuery): Promise<ReceivablesSource>;
  /** Null when the customer does not exist in the Organization. */
  customer(query: CustomerReceivableQuery): Promise<CustomerReceivableSource | null>;
}
