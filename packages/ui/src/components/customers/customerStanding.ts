import {
  RECEIVABLES_AGING_EDGES,
  type CustomerReceivable,
  type ReceivablesSummary,
} from '@pump/shared';
import type { PumpStatus } from '../../pump-ds/index.js';
import { countOverdueCustomers } from '../../query/useStationAlerts.js';

/**
 * Where each customer stands, for the Customers list (#527). The tiles read
 * the server's receivables summary (`GET /reports/receivables`); the list never
 * adds up `currentBalance` for them.
 *
 * A row reads the summary's figure for its customer. The summary lists only
 * active customers, and at most `RECEIVABLES_CUSTOMER_LIMIT` of them, so a
 * customer it leaves out (inactive, past the cap, or no summary at all: a Role
 * that may not read receivables, or a failed request) falls back to its own
 * stored balance. Only the summary can say a receivable is overdue.
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
  metadata?: {
    tradeName?: string | null;
    gstin?: string | null;
    pan?: string | null;
    billingAddress?: string | null;
  } | null;
}

export interface CustomerStanding {
  /** What they owe now (≥ 0): the summary's figure, else the stored balance. */
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

/** Days after which a receivable is overdue: the mid aging edge (30). */
export const OVERDUE_AFTER_DAYS = RECEIVABLES_AGING_EDGES.midMaxDays;

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
  const receivable = server ? server.balance : Math.max(0, stored);
  const days = server?.oldestUnpaidDays ?? null;
  const limit = creditLineOf(c);
  return {
    receivable,
    advance: Math.max(0, -stored),
    overdueDays: days != null && days > OVERDUE_AFTER_DAYS ? days : null,
    overLimitBy: limit > 0 && receivable > limit ? receivable - limit : 0,
    paidUp: receivable <= 0,
    eodDue: c.settlementCycle === 'EOD' && receivable > 0,
  };
}

/** The summary's rows by customer, or `null` without a summary. */
export const receivablesByCustomer = (summary: ReceivablesSummary | undefined) =>
  summary ? new Map(summary.customers.map((r) => [r.customerId, r])) : null;

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

/**
 * The status chips of a row, problems first: Over limit, Overdue, then
 * Inactive. The Status column renders and sorts by this one list.
 */
export function standingStatuses({
  customer,
  standing,
}: StandingRow): { status: PumpStatus; label?: string }[] {
  return [
    ...(standing.overLimitBy > 0 ? [{ status: 'over-limit' as const }] : []),
    ...(standing.overdueDays != null
      ? [{ status: 'overdue' as const, label: `Overdue ${standing.overdueDays}d` }]
      : []),
    ...(customer.isActive === false ? [{ status: 'inactive' as const }] : []),
  ];
}

export interface CustomerStandings {
  rows: StandingRow[];
  counts: Record<CustomerFilter, number>;
  /** Whether a summary was read (only it can say overdue). */
  fromServer: boolean;
}

export function buildStandings(
  customers: readonly CustomerRow[],
  summary: ReceivablesSummary | undefined,
): CustomerStandings {
  const byCustomer = receivablesByCustomer(summary);
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

/** The receivable tiles, read off the server summary. */
export interface ReceivableKpis {
  total: number;
  owing: number;
  /** The open debits older than the edge: the overdue part of the receivable. */
  overdue: number;
  overdueCustomers: number;
  oldestOverdueDays: number | null;
}

export function receivableKpis(summary: ReceivablesSummary): ReceivableKpis {
  const days = summary.customers
    .map((r) => r.oldestUnpaidDays ?? 0)
    .filter((d) => d > OVERDUE_AFTER_DAYS);
  return {
    total: summary.total,
    owing: summary.customerCount,
    overdue: summary.aging.d30plus,
    overdueCustomers: countOverdueCustomers(summary.customers),
    oldestOverdueDays: days.length ? Math.max(...days) : null,
  };
}

/** Customers over their credit line, and the one furthest over. Reads the rows (credit limits are not in the summary). */
export function overLimitKpi(standings: CustomerStandings): {
  count: number;
  worst: { name: string; by: number } | null;
} {
  const over = standings.rows
    .filter((r) => r.standing.overLimitBy > 0)
    .sort((a, b) => b.standing.overLimitBy - a.standing.overLimitBy);
  return {
    count: over.length,
    worst: over[0] ? { name: over[0].customer.name, by: over[0].standing.overLimitBy } : null,
  };
}
