import { sql, type SQL } from 'drizzle-orm';
import type { DbClient } from '@pump/db';
import { PAYABLES_PRODUCT_LIMIT, PAYABLES_SUPPLIER_LIMIT } from '@pump/shared';
import type {
  PayableSourceRow,
  PayablesQuery,
  PayablesReader,
  PayablesSource,
  SupplierPayableQuery,
  SupplierPayableSource,
} from '@pump/core';
import { supplierSignedAmount } from '../supplier-ledger-sql.js';

const num = (v: unknown): number => Number(v ?? 0) || 0;

interface PerSupplierRow {
  supplierId: string;
  balance: unknown;
  unpaidCount: unknown;
  oldestUnpaidDate: string | null;
}

const toSourceRow = (r: PerSupplierRow): PayableSourceRow => ({
  supplierId: r.supplierId,
  balance: num(r.balance),
  unpaidCount: Number(r.unpaidCount ?? 0) || 0,
  oldestUnpaidDate: r.oldestUnpaidDate ?? null,
});

/**
 * The FIFO settlement, in SQL. Shared by the list and the single-supplier read
 * so the two can never settle a Purchase differently.
 *
 * The whole supplier ledger is the one `supplier_transactions` table, split into
 * its two sides by `supplierSignedAmount`:
 *  - DEBITS (what you owe): signed amount > 0: Purchases, Opening Balance, debit
 *    Adjustments. A Purchase is dated by its Business Date (copied into
 *    `entry_date`).
 *  - CREDITS (what you paid): signed amount < 0: Supplier Payments (dated by
 *    their Entry Date) and credit Adjustments.
 *
 * Payments settle the OLDEST open debit first, so no ledger is walked: a running
 * sum of debits per supplier (oldest first) is compared with the supplier's TOTAL
 * credits, and the open part of a debit is `clamp(running debit - total credit,
 * 0, amount)`. An overpayment leaves every debit settled (an advance, which the
 * list never shows as a payable). The unpaid count and oldest unpaid date look at
 * Purchases only: an Opening Balance still takes its turn in the FIFO, but is
 * not "a Purchase waiting to be paid". `credit_total` is MATERIALIZED so it is
 * summed once; left inlined, the single-supplier plan re-scanned the ledger once
 * per debit (a nested loop of N x M).
 *
 * Tenancy: every row is reached through `organization_id` (the ledger row and the
 * supplier itself). `scope` narrows to one supplier, or to active suppliers (the
 * list, matching the To pay list).
 */
function fifoCtes(organizationId: string, scope: SQL) {
  return sql`
    ledger AS (
      SELECT st.id, st.supplier_id, st.entry_date AS date, st.created_at,
             st.transaction_type AS type, st.reference_type, st.reference_id,
             st.funding_account_id, ${supplierSignedAmount('st')} AS signed
      FROM supplier_transactions st
      JOIN suppliers su
        ON su.id = st.supplier_id AND su.organization_id = ${organizationId}
      WHERE st.organization_id = ${organizationId}
        ${scope}
    ),
    debit_cum AS (
      SELECT l.id, l.supplier_id, l.date, l.type, l.signed AS amount,
        SUM(l.signed) OVER (
          PARTITION BY l.supplier_id ORDER BY l.date, l.created_at, l.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cum_debit
      FROM ledger l
      WHERE l.signed > 0
    ),
    credit_total AS MATERIALIZED (
      SELECT supplier_id, SUM(-signed) AS total FROM ledger WHERE signed < 0 GROUP BY supplier_id
    ),
    open_debits AS (
      SELECT dc.supplier_id, dc.date, dc.type,
        LEAST(dc.amount, GREATEST(0, dc.cum_debit - COALESCE(ct.total, 0))) AS open_amount
      FROM debit_cum dc
      LEFT JOIN credit_total ct ON ct.supplier_id = dc.supplier_id
    ),
    per_supplier AS (
      SELECT supplier_id,
        SUM(open_amount) AS balance,
        COUNT(*) FILTER (WHERE type = 'Purchase' AND open_amount > 0)::int AS unpaid_count,
        MIN(date) FILTER (WHERE type = 'Purchase' AND open_amount > 0) AS oldest
      FROM open_debits
      GROUP BY supplier_id
      HAVING SUM(open_amount) > 0
    )`;
}

/**
 * Reads the payables summary. Each read is ONE statement of a fixed set of CTEs
 * whatever the number of suppliers or ledger entries; the Worker only maps a
 * bounded result (totals, at most `PAYABLES_SUPPLIER_LIMIT` suppliers; or one
 * supplier with at most `PAYABLES_PRODUCT_LIMIT` products).
 *
 * Indexes: `supplier_transactions_org_supplier_entry_date_idx` (single supplier),
 * `purchase_items_purchase_id_idx`, the `purchases` / `suppliers` primary keys.
 * The list is one pass over the organization's supplier ledger, the same shape
 * as the suppliers list's balance query.
 */
export class DrizzlePayablesReader implements PayablesReader {
  constructor(private readonly db: DbClient) {}

  async summary(q: PayablesQuery): Promise<PayablesSource> {
    const org = q.organizationId;
    const rows = (await this.db.execute(sql`
      WITH ${fifoCtes(org, sql`AND su.is_active`)},
      month_flow AS (
        SELECT
          COALESCE(SUM(l.signed) FILTER (
            WHERE l.type = 'Purchase' AND l.date >= ${q.purchasedFrom} AND l.date <= ${q.purchasedTo}
          ), 0) AS purchased,
          COALESCE(SUM(-l.signed) FILTER (
            WHERE l.type = 'Payment' AND l.date >= ${q.paidFrom} AND l.date <= ${q.paidTo}
          ), 0) AS paid
        FROM ledger l
      )
      SELECT
        COALESCE(SUM(balance), 0) AS total,
        COUNT(*)::int AS "supplierCount",
        (SELECT purchased FROM month_flow) AS purchased,
        (SELECT paid FROM month_flow) AS paid,
        COALESCE((
          SELECT json_agg(json_build_object(
            'supplierId', top.supplier_id, 'balance', top.balance,
            'unpaidCount', top.unpaid_count, 'oldestUnpaidDate', top.oldest
          ) ORDER BY top.balance DESC, top.supplier_id)
          FROM (
            SELECT * FROM per_supplier
            ORDER BY balance DESC, supplier_id
            LIMIT ${PAYABLES_SUPPLIER_LIMIT}
          ) top
        ), '[]'::json) AS suppliers
      FROM per_supplier
    `)) as unknown as Array<{
      total: unknown;
      supplierCount: number;
      purchased: unknown;
      paid: unknown;
      suppliers: PerSupplierRow[] | null;
    }>;
    const row = rows[0];
    return {
      total: num(row?.total),
      supplierCount: Number(row?.supplierCount ?? 0),
      month: { purchased: num(row?.purchased), paid: num(row?.paid) },
      suppliers: (row?.suppliers ?? []).map(toSourceRow),
    };
  }

  async supplier(q: SupplierPayableQuery): Promise<SupplierPayableSource | null> {
    const org = q.organizationId;
    const id = q.supplierId;
    const rows = (await this.db.execute(sql`
      WITH ${fifoCtes(org, sql`AND su.id = ${id}`)},
      last_payment AS (
        SELECT -l.signed AS amount, l.date AS "entryDate",
               fa.account_type AS method, fa.name AS "fundingAccountName"
        FROM ledger l
        LEFT JOIN financial_accounts fa
          ON fa.id = l.funding_account_id AND fa.organization_id = ${org}
        WHERE l.type = 'Payment'
        ORDER BY l.date DESC, l.created_at DESC, l.id DESC
        LIMIT 1
      ),
      month_flow AS (
        SELECT
          COALESCE(SUM(l.signed) FILTER (
            WHERE l.type = 'Purchase' AND l.date >= ${q.purchasedFrom} AND l.date <= ${q.purchasedTo}
          ), 0) AS purchased,
          COUNT(*) FILTER (
            WHERE l.type = 'Purchase' AND l.date >= ${q.purchasedFrom} AND l.date <= ${q.purchasedTo}
          )::int AS purchase_count,
          COALESCE(SUM(-l.signed) FILTER (
            WHERE l.type = 'Payment' AND l.date >= ${q.paidFrom} AND l.date <= ${q.paidTo}
          ), 0) AS paid
        FROM ledger l
      ),
      -- What this month's Purchases brought in, per product. A Purchase is found
      -- through its ledger row (reference_id), then its items; the purchase's
      -- Business Day is joined only to prove it belongs to this Organization.
      month_items AS (
        SELECT pit.product_id, pr.name, pr.unit, pr.product_type,
               SUM(pit.quantity) AS quantity, SUM(pit.line_total) AS value
        FROM ledger l
        JOIN purchases p
          ON p.id = l.reference_id AND l.reference_type = 'PURCHASE' AND p.supplier_id = l.supplier_id
        JOIN business_days pbd
          ON pbd.id = p.business_day_id AND pbd.organization_id = ${org}
        JOIN purchase_items pit ON pit.purchase_id = p.id
        JOIN products pr ON pr.id = pit.product_id AND pr.organization_id = ${org}
        WHERE l.type = 'Purchase' AND l.date >= ${q.purchasedFrom} AND l.date <= ${q.purchasedTo}
        GROUP BY pit.product_id, pr.name, pr.unit, pr.product_type
      )
      SELECT
        su.id AS "supplierId",
        COALESCE((SELECT SUM(signed) FROM ledger), 0) AS balance,
        COALESCE(ps.unpaid_count, 0) AS "unpaidCount",
        ps.oldest AS "oldestUnpaidDate",
        (SELECT row_to_json(lp) FROM last_payment lp) AS "lastPayment",
        (SELECT purchased FROM month_flow) AS "monthPurchased",
        (SELECT paid FROM month_flow) AS "monthPaid",
        (SELECT purchase_count FROM month_flow) AS "monthPurchaseCount",
        -- Litres = fuel received. Fuel is told apart by product type, never by the
        -- free-text unit ('L', 'Ltr', 'Litre' are all typed in the wild).
        COALESCE((SELECT SUM(quantity) FILTER (WHERE product_type = 'FUEL') FROM month_items), 0) AS "monthLitres",
        COALESCE((
          SELECT json_agg(json_build_object(
            'productId', top.product_id, 'name', top.name, 'unit', top.unit,
            'quantity', top.quantity, 'value', top.value
          ) ORDER BY top.value DESC, top.name)
          FROM (
            SELECT * FROM month_items ORDER BY value DESC, name LIMIT ${PAYABLES_PRODUCT_LIMIT}
          ) top
        ), '[]'::json) AS products
      FROM suppliers su
      LEFT JOIN per_supplier ps ON ps.supplier_id = su.id
      WHERE su.id = ${id} AND su.organization_id = ${org}
    `)) as unknown as Array<
      PerSupplierRow & {
        lastPayment: {
          amount: unknown;
          entryDate: string;
          method: string | null;
          fundingAccountName: string | null;
        } | null;
        monthPurchased: unknown;
        monthPaid: unknown;
        monthPurchaseCount: number;
        monthLitres: unknown;
        products: Array<{
          productId: string;
          name: string;
          unit: string;
          quantity: unknown;
          value: unknown;
        }> | null;
      }
    >;
    const row = rows[0];
    if (!row) return null;
    return {
      payable: toSourceRow(row),
      lastPayment: row.lastPayment
        ? {
            amount: num(row.lastPayment.amount),
            entryDate: row.lastPayment.entryDate,
            method: row.lastPayment.method ?? null,
            fundingAccountName: row.lastPayment.fundingAccountName ?? null,
          }
        : null,
      month: {
        purchased: num(row.monthPurchased),
        paid: num(row.monthPaid),
        purchaseCount: Number(row.monthPurchaseCount ?? 0),
        quantity: num(row.monthLitres),
      },
      purchasesByProduct: (row.products ?? []).map((p) => ({
        productId: p.productId,
        name: p.name,
        unit: p.unit,
        quantity: num(p.quantity),
        value: num(p.value),
      })),
    };
  }
}
