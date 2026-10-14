import {
  RECEIVABLES_AGING_EDGES,
  type CustomerReceivable,
  type ReceivablesSummary,
} from '@pump/shared';

/**
 * Where each customer stands, for the Customers list (#527). The receivable,
 * its age and the totals come from the server's receivables summary
 * (`GET /reports/receivables`); the list never adds up `currentBalance`.
 *
 * Without a summary (a Role that may not read receivables, or a failed
 * request) the list still reads: a row falls back to its own stored balance,
 * nothing is called overdue, and there is no total.
 */

/** A customer row as the API lists it. */
export interface CustomerRow {
  id: string;
  name: string;
  customerType?: string | null;
  creditLimit?: number | string | null;
  currentBalance?: number | string | null;
  isPrepaid?: boolean | null;
  isActive?: boolean | null;
  settlementCycle?: string | null;
  fleetCode?: string | null;
  phone?: string | null;
  metadata?: { tradeName?: string | null; gstin?: string | null } | null;
}

export interface CustomerStanding {
  /** What they owe now (≥ 0). The server's figure when the summary is loaded. */
  receivable: number;
  /** Money held for them (a negative stored balance), ≥ 0. */
  advance: number;
  /** Days since the oldest unpaid debit, when it is past the overdue edge. */
  overdueDays: number | null;
  /** By how much the receivable passes the credit limit; 0 when within it. */
  overLimitBy: number;
  paidUp: boolean;
  /** End-of-day settlement customer with something to settle. */
  eodDue: boolean;
}

/** A receivable is overdue once its oldest unpaid debit is past the mid aging edge (30 days). */
export const isOverdue = (r: Pick<CustomerReceivable, 'oldestUnpaidDays'> | undefined) =>
  (r?.oldestUnpaidDays ?? 0) > RECEIVABLES_AGING_EDGES.midMaxDays;

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The customer's credit line, or 0 when it has none (prepaid OMC cards settle via the OMC). */
export const creditLineOf = (c: CustomerRow) => (c.isPrepaid ? 0 : Math.max(0, num(c.creditLimit)));

export function standingOf(
  c: CustomerRow,
  byCustomer: ReadonlyMap<string, CustomerReceivable> | null,
): CustomerStanding {
  const stored = num(c.currentBalance);
  const server = byCustomer?.get(c.id);
  const receivable = byCustomer ? (server?.balance ?? 0) : Math.max(0, stored);
  const limit = creditLineOf(c);
  return {
    receivable,
    advance: Math.max(0, -stored),
    overdueDays: isOverdue(server) ? (server?.oldestUnpaidDays ?? null) : null,
    overLimitBy: limit > 0 && receivable > limit ? receivable - limit : 0,
    paidUp: receivable <= 0,
    eodDue: c.settlementCycle === 'EOD' && receivable > 0,
  };
}

export type CustomerFilter = 'all' | 'overdue' | 'over-limit' | 'paid-up' | 'eod-due';

const MATCH: Record<CustomerFilter, (s: CustomerStanding) => boolean> = {
  all: () => true,
  overdue: (s) => s.overdueDays != null,
  'over-limit': (s) => s.overLimitBy > 0,
  'paid-up': (s) => s.paidUp,
  'eod-due': (s) => s.eodDue,
};

export interface StandingRow {
  customer: CustomerRow;
  standing: CustomerStanding;
}

export interface CustomerStandings {
  rows: StandingRow[];
  counts: Record<CustomerFilter, number>;
  /** Whether the figures come from the server summary (overdue and totals need it). */
  fromServer: boolean;
}

export function buildStandings(
  customers: readonly CustomerRow[],
  summary: ReceivablesSummary | undefined,
): CustomerStandings {
  const byCustomer = summary ? new Map(summary.customers.map((r) => [r.customerId, r])) : null;
  const rows = customers.map((customer) => ({
    customer,
    standing: standingOf(customer, byCustomer),
  }));
  const counts = Object.fromEntries(
    (Object.keys(MATCH) as CustomerFilter[]).map((f) => [
      f,
      rows.filter((r) => MATCH[f](r.standing)).length,
    ]),
  ) as Record<CustomerFilter, number>;
  return { rows, counts, fromServer: !!summary };
}

/** Rows a filter chip and the search leave, in list order. */
export function filterStandings(
  rows: readonly StandingRow[],
  filter: CustomerFilter,
  search: string,
): StandingRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter(({ customer: c, standing }) => {
    if (!MATCH[filter](standing)) return false;
    if (!q) return true;
    return [c.name, c.metadata?.tradeName, c.phone, c.fleetCode, c.metadata?.gstin].some((v) =>
      (v ?? '').toLowerCase().includes(q),
    );
  });
}

/** The receivable KPIs, read off the server summary. */
export interface ReceivableKpis {
  total: number;
  owing: number;
  /** The 30+ days bucket: the overdue part of the receivable. */
  overdue: number;
  overdueCustomers: number;
  oldestOverdueDays: number | null;
  overLimit: number;
  /** The customer furthest over their limit. */
  worstOverLimit: { name: string; by: number } | null;
}

export function receivableKpis(
  summary: ReceivablesSummary,
  standings: CustomerStandings,
): ReceivableKpis {
  const overdueDays = standings.rows
    .map((r) => r.standing.overdueDays)
    .filter((d): d is number => d != null);
  const over = standings.rows
    .filter((r) => r.standing.overLimitBy > 0)
    .sort((a, b) => b.standing.overLimitBy - a.standing.overLimitBy);
  return {
    total: summary.total,
    owing: summary.customerCount,
    overdue: summary.aging.d30plus,
    overdueCustomers: summary.customers.filter(isOverdue).length,
    oldestOverdueDays: overdueDays.length ? Math.max(...overdueDays) : null,
    overLimit: over.length,
    worstOverLimit: over[0]
      ? { name: over[0].customer.name, by: over[0].standing.overLimitBy }
      : null,
  };
}
