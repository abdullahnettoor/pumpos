import { sql } from 'drizzle-orm';
import type { DbClient } from '@pump/db';
import type { CreditSaleRecord, ShiftReconciliationTotals } from '@pump/core';

/**
 * Shift-scoped money/reading SQL shared by the consolidated statements
 * (#229/#230/#231): the drawer-reconciliation totals expression, the
 * credit-sale line shape, and the batched nozzle-reading update. One source
 * for each, so the close path, shift status, and the summary projection can
 * never drift apart.
 */

/**
 * The whole drawer model as ONE jsonb expression: each money source is a
 * scalar aggregate sub-select and the per-seller cash breakdown is a jsonb
 * array. Pair with {@link assembleReconTotals}.
 */
export function reconTotalsJson(shiftId: string) {
  return sql`(SELECT jsonb_build_object(
    'cash_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'Cash'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'card_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'Card'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'upi_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'UPI'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'credit_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'Credit'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'drawer_expenses', (SELECT COALESCE(SUM(amount) FILTER (
        WHERE affects_drawer AND COALESCE(status, '') <> 'VOIDED'), 0)::float8
      FROM expenses WHERE shift_id = ${shiftId}),
    'cash_income', (SELECT COALESCE(SUM(amount) FILTER (
        WHERE affects_drawer AND COALESCE(status, '') <> 'VOIDED'), 0)::float8
      FROM other_income WHERE shift_id = ${shiftId}),
    'drawer_supplier_payments', (SELECT COALESCE(SUM(amount) FILTER (
        WHERE transaction_type = 'Payment' AND affects_drawer), 0)::float8
      FROM supplier_transactions WHERE shift_id = ${shiftId}),
    'handover_cash', (SELECT COALESCE(SUM(cash_handed_over), 0)::float8
      FROM attendant_handovers WHERE shift_id = ${shiftId}),
    'handover_count', (SELECT COUNT(*)::int FROM attendant_handovers WHERE shift_id = ${shiftId}),
    -- Per-seller cash portion of cash-recorded sales (total − non-cash), with
    -- whether the seller has a DU handover this shift ("inside" sellers' cash
    -- is already declared in their handover cashHandedOver).
    'sellers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'attendantId', t.attendant_id,
        'fullName', t.full_name,
        'amount', t.amount,
        'inside', t.inside
      )) FROM (
        SELECT
          s.attendant_id,
          u.full_name,
          SUM(s.total_amount - COALESCE(s.non_cash_amount, 0))::float8 AS amount,
          (s.attendant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM attendant_handovers h
            WHERE h.shift_id = ${shiftId} AND h.user_id = s.attendant_id
          )) AS inside
        FROM sales s
        LEFT JOIN users u ON u.id = s.attendant_id
        WHERE s.shift_id = ${shiftId} AND s.payment_method = 'Cash'
        GROUP BY s.attendant_id, u.full_name
      ) t), '[]'::jsonb)
  ))`;
}

/** Assemble the port shape from the reconTotalsJson payload (shared JS math). */
export function assembleReconTotals(raw: Record<string, any>): ShiftReconciliationTotals {
  const sellers =
    (raw.sellers as Array<{
      attendantId: string | null;
      fullName: string | null;
      amount: number;
      inside: boolean;
    }>) ?? [];
  const handoverCount = Number(raw.handover_count ?? 0);
  const handoverCash = Number(raw.handover_cash ?? 0);

  // Cash sales for the drawer = the cash attendants declared in their DU handovers
  // (fuel cash is never a `sales` row — it's metered and declared at handover),
  // PLUS merchandise cash from sellers who have NO handover (office/counter staff),
  // whose cash isn't captured anywhere else. Attendants' own merch cash is already
  // inside their handover cashHandedOver. Fall back to all merch cash when there
  // are no handovers at all (legacy / handover-less shifts).
  const merchCashSales = sellers.reduce((acc, s) => acc + Number(s.amount), 0);
  const outsideRows = sellers.filter((s) => !s.inside);
  const nonHandoverMerchCash = outsideRows.reduce((acc, s) => acc + Number(s.amount), 0);

  // Per-seller breakdown of the non-attendant (outside-handover) merch cash,
  // computed from the SAME rows as the total so the two always reconcile.
  // Sales with no seller fall under "Counter / unassigned".
  const rowsForBreakdown = handoverCount > 0 ? outsideRows : sellers;
  const merchCashOutsideHandoverBreakdown = rowsForBreakdown
    .filter((s) => Number(s.amount) !== 0)
    .map((s) => ({
      sellerName: s.attendantId == null ? 'Counter / unassigned' : (s.fullName ?? 'Unknown'),
      amount: Number(s.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    cashSales: handoverCount > 0 ? handoverCash + nonHandoverMerchCash : merchCashSales,
    handoverCash: handoverCount > 0 ? handoverCash : 0,
    merchCashOutsideHandover: handoverCount > 0 ? nonHandoverMerchCash : merchCashSales,
    merchCashOutsideHandoverBreakdown,
    cashCollections: Number(raw.cash_collections ?? 0),
    cardCollections: Number(raw.card_collections ?? 0),
    upiCollections: Number(raw.upi_collections ?? 0),
    creditCollections: Number(raw.credit_collections ?? 0),
    cashIncome: Number(raw.cash_income ?? 0),
    drawerExpenses: Number(raw.drawer_expenses ?? 0),
    drawerSupplierPayments: Number(raw.drawer_supplier_payments ?? 0),
  };
}

/** The raw jsonb row shape produced by {@link creditSaleLinesJson}. */
export interface CreditSaleLineRow {
  id: string;
  amount: string;
  quantity: string | null;
  unitPrice: string | null;
  notes: string | null;
  duId: string | null;
  attendantId: string | null;
  customerId: string | null;
  vehicleId: string | null;
  productId: string | null;
  customerName: string | null;
  productName: string | null;
  productCode: string | null;
  unit: string | null;
  vehicleNumber: string | null;
}

/**
 * The shift's credit-sale line items (transactionType 'Credit Sale' /
 * referenceType CREDIT_SALE) with customer/product/vehicle enrichment, as one
 * jsonb array. Numerics render as strings (drizzle shape); consumers apply
 * their own coercion — {@link toCreditSaleRecord} for the core port shape.
 */
export function creditSaleLinesJson(shiftId: string) {
  return sql`
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', ct.id,
      'amount', ct.amount::text,
      'quantity', ct.quantity::text,
      'unitPrice', ct.unit_price::text,
      'notes', ct.notes,
      'duId', ct.du_id,
      'attendantId', ct.attendant_id,
      'customerId', ct.customer_id,
      'vehicleId', ct.vehicle_id,
      'productId', ct.product_id,
      'customerName', cust.name,
      'productName', prod.name,
      'productCode', prod.code,
      'unit', prod.unit,
      'vehicleNumber', cv.registration_number
    ) ORDER BY ct.created_at, ct.id)
    FROM customer_transactions ct
    LEFT JOIN customers cust ON cust.id = ct.customer_id
    LEFT JOIN products prod ON prod.id = ct.product_id
    LEFT JOIN customer_vehicles cv ON cv.id = ct.vehicle_id
    WHERE ct.shift_id = ${shiftId}
      AND ct.transaction_type = 'Credit Sale'
      AND ct.reference_type = 'CREDIT_SALE'), '[]'::jsonb)
`;
}

/** Coerce a credit-sale line into the core CreditSaleRecord port shape. */
export function toCreditSaleRecord(r: CreditSaleLineRow): CreditSaleRecord {
  return {
    id: r.id,
    amount: Number(r.amount),
    quantity: r.quantity != null ? Number(r.quantity) : null,
    unitPrice: r.unitPrice != null ? Number(r.unitPrice) : null,
    notes: r.notes ?? null,
    duId: r.duId ?? null,
    attendantId: r.attendantId ?? null,
    customerId: r.customerId ?? '',
    vehicleId: r.vehicleId ?? null,
    productId: r.productId ?? null,
    customerName: r.customerName ?? 'Customer',
    productName: r.productName ?? null,
    productCode: r.productCode ?? null,
    vehicleNumber: r.vehicleNumber ?? null,
  };
}

/**
 * Batched nozzle-reading update: ONE `UPDATE … FROM (VALUES …)` statement for
 * any number of nozzles (#229/#231) — the per-row loop cost a round-trip per
 * nozzle inside money-path transactions. testingVolume is only written when
 * provided (handover path), preserving the stored value otherwise.
 */
export async function updateReadingColumns(
  db: DbClient,
  rows: { id: string; closingReading: string; volumeSold: string; testingVolume?: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  const withTesting = rows.some((r) => r.testingVolume !== undefined);
  const values = sql.join(
    rows.map((r) =>
      withTesting
        ? sql`(${r.id}::uuid, ${r.closingReading}::numeric, ${r.volumeSold}::numeric, ${r.testingVolume ?? null}::numeric)`
        : sql`(${r.id}::uuid, ${r.closingReading}::numeric, ${r.volumeSold}::numeric)`,
    ),
    sql`, `,
  );
  if (withTesting) {
    await db.execute(sql`
      UPDATE nozzle_readings nr SET
        closing_reading = v.closing_reading,
        volume_sold = v.volume_sold,
        testing_volume = COALESCE(v.testing_volume, nr.testing_volume)
      FROM (VALUES ${values}) AS v(id, closing_reading, volume_sold, testing_volume)
      WHERE nr.id = v.id
    `);
  } else {
    await db.execute(sql`
      UPDATE nozzle_readings nr SET
        closing_reading = v.closing_reading,
        volume_sold = v.volume_sold
      FROM (VALUES ${values}) AS v(id, closing_reading, volume_sold)
      WHERE nr.id = v.id
    `);
  }
}
