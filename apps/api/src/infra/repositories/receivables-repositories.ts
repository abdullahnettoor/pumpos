import { sql, type SQL } from 'drizzle-orm';
import type { DbClient } from '@pump/db';
import {
  RECEIVABLES_AGING_EDGES,
  RECEIVABLES_CUSTOMER_LIMIT,
  RECEIVABLES_SETTLED_SAMPLE,
  RECEIVABLES_VEHICLE_LIMIT,
} from '@pump/shared';
import type {
  CustomerReceivableQuery,
  CustomerReceivableSource,
  ReceivableSourceRow,
  ReceivablesQuery,
  ReceivablesReader,
  ReceivablesSource,
} from '@pump/core';

const num = (v: unknown): number => Number(v ?? 0) || 0;

interface PerCustomerRow {
  customerId: string;
  balance: unknown;
  oldestUnpaidDate: string | null;
  d0_7: unknown;
  d8_30: unknown;
  d30plus: unknown;
}

const toSourceRow = (r: PerCustomerRow): ReceivableSourceRow => ({
  customerId: r.customerId,
  balance: num(r.balance),
  oldestUnpaidDate: r.oldestUnpaidDate ?? null,
  aging: { d0_7: num(r.d0_7), d8_30: num(r.d8_30), d30plus: num(r.d30plus) },
});

/**
 * The FIFO settlement, in SQL. Shared by the list and the single-customer read so
 * the two can never age a debit differently.
 *
 * The customer ledger has two sides:
 *  - DEBITS: `customer_transactions` of a positive amount that are not an OMC
 *    fleet-card sale (never a receivable) or a legacy 'Collection' row: Credit
 *    Sales, Opening Balance, debit Adjustments. Dated by their Business Date.
 *  - CREDITS: Collections (the Office Record, dated by its Entry Date) and
 *    negative Adjustments. Together these are exactly what the customers list
 *    subtracts for `currentBalance`.
 *
 * Collections and credit adjustments settle the OLDEST open debit first, so no
 * ledger is walked: a running sum of debits per customer (oldest first) is
 * compared with the customer's TOTAL credits, and the open part of a debit is
 * `clamp(running debit - total credit, 0, amount)`. Whatever is left is aged from
 * the debit's Business Date to the Current Business Date. An overpayment leaves
 * every debit settled and no receivable (an advance).
 *
 * Tenancy: every row is reached through `organization_id` - debits through their
 * Business Day (`customer_transactions` carries no organization), credits on
 * `collections.organization_id`, and the customer itself on `customers`.
 * `scope` narrows to one customer (and keeps inactive ones, which the list drops
 * so it matches the To collect list).
 */
function fifoCtes(organizationId: string, currentBusinessDate: string, scope: SQL) {
  const { recentMaxDays, midMaxDays } = RECEIVABLES_AGING_EDGES;
  return sql`
    debits AS (
      SELECT ct.id, ct.customer_id, bd.business_date AS date, ct.created_at, ct.amount,
             ct.transaction_type AS type, ct.quantity, ct.product_id, ct.vehicle_id
      FROM customer_transactions ct
      JOIN business_days bd
        ON bd.id = ct.business_day_id AND bd.organization_id = ${organizationId}
      JOIN customers cu
        ON cu.id = ct.customer_id AND cu.organization_id = ${organizationId}
      WHERE ct.transaction_type NOT IN ('OMC Sale', 'Collection')
        AND ct.amount > 0
        ${scope}
    ),
    credits AS (
      SELECT ct.id, ct.customer_id, bd.business_date AS date, ct.created_at,
             -ct.amount AS amount, 'ADJUSTMENT'::text AS kind
      FROM customer_transactions ct
      JOIN business_days bd
        ON bd.id = ct.business_day_id AND bd.organization_id = ${organizationId}
      JOIN customers cu
        ON cu.id = ct.customer_id AND cu.organization_id = ${organizationId}
      WHERE ct.transaction_type NOT IN ('OMC Sale', 'Collection')
        AND ct.amount < 0
        ${scope}
      UNION ALL
      SELECT co.id, co.customer_id, co.entry_date AS date, co.created_at,
             co.amount, 'COLLECTION'::text AS kind
      FROM collections co
      JOIN customers cu
        ON cu.id = co.customer_id AND cu.organization_id = ${organizationId}
      WHERE co.organization_id = ${organizationId}
        ${scope}
    ),
    debit_cum AS (
      SELECT d.*,
        SUM(d.amount) OVER (
          PARTITION BY d.customer_id ORDER BY d.date, d.created_at, d.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cum_debit
      FROM debits d
    ),
    credit_total AS (
      SELECT customer_id, SUM(amount) AS total FROM credits GROUP BY customer_id
    ),
    open_debits AS (
      SELECT dc.customer_id, dc.date,
        LEAST(dc.amount, GREATEST(0, dc.cum_debit - COALESCE(ctt.total, 0))) AS open_amount,
        GREATEST(0, ${currentBusinessDate}::date - dc.date::date) AS age
      FROM debit_cum dc
      LEFT JOIN credit_total ctt ON ctt.customer_id = dc.customer_id
    ),
    per_customer AS (
      SELECT customer_id,
        SUM(open_amount) AS balance,
        MIN(date) FILTER (WHERE open_amount > 0) AS oldest,
        COALESCE(SUM(open_amount) FILTER (WHERE age <= ${recentMaxDays}), 0) AS d0_7,
        COALESCE(SUM(open_amount) FILTER (WHERE age > ${recentMaxDays} AND age <= ${midMaxDays}), 0) AS d8_30,
        COALESCE(SUM(open_amount) FILTER (WHERE age > ${midMaxDays}), 0) AS d30plus
      FROM open_debits
      GROUP BY customer_id
      HAVING SUM(open_amount) > 0
    )`;
}

/**
 * Reads the receivables summary. Each read is ONE statement of a fixed set of
 * CTEs whatever the number of customers or ledger entries; the Worker only maps
 * a bounded result (totals, at most `RECEIVABLES_CUSTOMER_LIMIT` customers; or
 * one customer with at most `RECEIVABLES_VEHICLE_LIMIT` vehicles).
 *
 * Indexes: `customer_txn_customer_business_day_created_idx` (single customer),
 * `business_days` primary key / `business_days_org_station_date_uniq`,
 * `collections_org_customer_entry_date_idx`.
 */
export class DrizzleReceivablesReader implements ReceivablesReader {
  constructor(private readonly db: DbClient) {}

  async summary(q: ReceivablesQuery): Promise<ReceivablesSource> {
    const org = q.organizationId;
    const rows = (await this.db.execute(sql`
      WITH ${fifoCtes(org, q.currentBusinessDate, sql`AND cu.is_active`)}
      SELECT
        COALESCE(SUM(d0_7), 0) AS "d0_7",
        COALESCE(SUM(d8_30), 0) AS "d8_30",
        COALESCE(SUM(d30plus), 0) AS "d30plus",
        COUNT(*)::int AS "customerCount",
        COALESCE((
          SELECT json_agg(json_build_object(
            'customerId', top.customer_id, 'balance', top.balance, 'oldestUnpaidDate', top.oldest,
            'd0_7', top.d0_7, 'd8_30', top.d8_30, 'd30plus', top.d30plus
          ) ORDER BY top.balance DESC, top.customer_id)
          FROM (
            SELECT * FROM per_customer
            ORDER BY balance DESC, customer_id
            LIMIT ${RECEIVABLES_CUSTOMER_LIMIT}
          ) top
        ), '[]'::json) AS customers
      FROM per_customer
    `)) as unknown as Array<{
      d0_7: unknown;
      d8_30: unknown;
      d30plus: unknown;
      customerCount: number;
      customers: PerCustomerRow[] | null;
    }>;
    const row = rows[0];
    return {
      aging: { d0_7: num(row?.d0_7), d8_30: num(row?.d8_30), d30plus: num(row?.d30plus) },
      customerCount: Number(row?.customerCount ?? 0),
      customers: (row?.customers ?? []).map(toSourceRow),
    };
  }

  async customer(q: CustomerReceivableQuery): Promise<CustomerReceivableSource | null> {
    const org = q.organizationId;
    const id = q.customerId;
    const rows = (await this.db.execute(sql`
      WITH ${fifoCtes(org, q.currentBusinessDate, sql`AND cu.id = ${id}`)},
      credit_ranges AS (
        SELECT c.customer_id, c.date, c.kind,
          SUM(c.amount) OVER w - c.amount AS lo,
          SUM(c.amount) OVER w AS hi
        FROM credits c
        WINDOW w AS (
          PARTITION BY c.customer_id ORDER BY c.date, c.created_at, c.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
      ),
      settled AS (
        -- A Credit Sale is settled by the credit whose running total first covers
        -- the running debit up to it. Only a Collection counts as the customer
        -- paying (a credit adjustment is the station writing a debt off); paid
        -- ahead of the sale is 0 days.
        SELECT GREATEST(0, cr.date::date - dc.date::date) AS days
        FROM debit_cum dc
        JOIN credit_ranges cr
          ON cr.customer_id = dc.customer_id AND dc.cum_debit > cr.lo AND dc.cum_debit <= cr.hi
        WHERE dc.type = 'Credit Sale' AND cr.kind = 'COLLECTION'
        ORDER BY cr.date DESC, dc.date DESC, dc.id DESC
        LIMIT ${RECEIVABLES_SETTLED_SAMPLE}
      ),
      last_payment AS (
        SELECT co.amount, co.entry_date AS "entryDate", co.payment_method AS method
        FROM collections co
        WHERE co.organization_id = ${org} AND co.customer_id = ${id}
        ORDER BY co.entry_date DESC, co.created_at DESC
        LIMIT 1
      ),
      month_sales AS (
        SELECT COALESCE(SUM(d.amount), 0) AS credit, COUNT(*)::int AS slips,
          COALESCE(SUM(CASE WHEN p.unit = 'L' THEN d.quantity END), 0) AS litres
        FROM debits d
        LEFT JOIN products p ON p.id = d.product_id AND p.organization_id = ${org}
        WHERE d.type = 'Credit Sale' AND d.date >= ${q.creditFrom} AND d.date <= ${q.creditTo}
      ),
      month_paid AS (
        SELECT COALESCE(SUM(amount), 0) AS paid
        FROM credits
        WHERE kind = 'COLLECTION' AND date >= ${q.paidFrom} AND date <= ${q.paidTo}
      ),
      vehicle_spend AS (
        SELECT cv.id, cv.registration_number, cv.vehicle_type, SUM(d.amount) AS amount,
          COALESCE(SUM(CASE WHEN p.unit = 'L' THEN d.quantity END), 0) AS litres
        FROM debits d
        JOIN customer_vehicles cv
          ON cv.id = d.vehicle_id AND cv.organization_id = ${org} AND cv.customer_id = d.customer_id
        LEFT JOIN products p ON p.id = d.product_id AND p.organization_id = ${org}
        WHERE d.type = 'Credit Sale' AND d.date >= ${q.creditFrom} AND d.date <= ${q.creditTo}
        GROUP BY cv.id, cv.registration_number, cv.vehicle_type
        ORDER BY SUM(d.amount) DESC, cv.registration_number
        LIMIT ${RECEIVABLES_VEHICLE_LIMIT}
      )
      SELECT
        cu.id AS "customerId",
        cu.settlement_cycle AS "settlementCycle",
        COALESCE(pc.balance, 0) AS balance,
        pc.oldest AS "oldestUnpaidDate",
        COALESCE(pc.d0_7, 0) AS "d0_7",
        COALESCE(pc.d8_30, 0) AS "d8_30",
        COALESCE(pc.d30plus, 0) AS "d30plus",
        (SELECT row_to_json(lp) FROM last_payment lp) AS "lastPayment",
        (SELECT COUNT(*)::int FROM settled) AS "settledCount",
        (SELECT AVG(days) FROM settled) AS "settledMeanDays",
        (SELECT credit FROM month_sales) AS "monthCredit",
        (SELECT slips FROM month_sales) AS "monthSlips",
        (SELECT litres FROM month_sales) AS "monthLitres",
        (SELECT paid FROM month_paid) AS "monthPaid",
        COALESCE((
          SELECT json_agg(json_build_object(
            'vehicleId', vs.id, 'registration', vs.registration_number, 'type', vs.vehicle_type,
            'amount', vs.amount, 'litres', vs.litres
          ) ORDER BY vs.amount DESC, vs.registration_number)
          FROM vehicle_spend vs
        ), '[]'::json) AS vehicles
      FROM customers cu
      LEFT JOIN per_customer pc ON pc.customer_id = cu.id
      WHERE cu.id = ${id} AND cu.organization_id = ${org}
    `)) as unknown as Array<
      PerCustomerRow & {
        settlementCycle: string;
        lastPayment: { amount: unknown; entryDate: string; method: string } | null;
        settledCount: number;
        settledMeanDays: unknown;
        monthCredit: unknown;
        monthSlips: number;
        monthLitres: unknown;
        monthPaid: unknown;
        vehicles: Array<{
          vehicleId: string;
          registration: string;
          type: string;
          amount: unknown;
          litres: unknown;
        }> | null;
      }
    >;
    const row = rows[0];
    if (!row) return null;
    return {
      settlementCycle: row.settlementCycle,
      receivable: toSourceRow(row),
      lastPayment: row.lastPayment
        ? {
            amount: num(row.lastPayment.amount),
            entryDate: row.lastPayment.entryDate,
            method: row.lastPayment.method,
          }
        : null,
      settled: { count: Number(row.settledCount ?? 0), meanDays: num(row.settledMeanDays) },
      month: {
        credit: num(row.monthCredit),
        slips: Number(row.monthSlips ?? 0),
        litres: num(row.monthLitres),
        paid: num(row.monthPaid),
      },
      vehicles: (row.vehicles ?? []).map((v) => ({
        vehicleId: v.vehicleId,
        registration: v.registration,
        type: v.type,
        amount: num(v.amount),
        litres: num(v.litres),
      })),
    };
  }
}
