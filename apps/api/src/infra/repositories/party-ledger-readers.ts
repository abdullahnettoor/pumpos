import { sql } from 'drizzle-orm';
import type { DbClient } from '@pump/db';
import { isValidBusinessDate } from '@pump/shared';
import { shiftSequenceSql } from '../shift-sequence-sql.js';

export type PartyLedgerRange = { from: string; to: string };

export type RangedPartyLedger = {
  periodOpeningBalance: string;
  closingBalance: string;
  entries: Array<Record<string, unknown>>;
};

export function parsePartyLedgerRange(
  from: string | undefined,
  to: string | undefined,
): { range: PartyLedgerRange } | { error: string } | null {
  if (!from && !to) return null;
  if (!from || !to || !isValidBusinessDate(from) || !isValidBusinessDate(to) || from > to) {
    return { error: 'from and to must be valid YYYY-MM-DD dates, with from <= to' };
  }
  return { range: { from, to } };
}

/** Keep row normalization shared between party statement sources. SQL numeric money stays text. */
export function mapPartyLedgerEntries(entries: Array<Record<string, unknown>>) {
  return entries.map((entry) => {
    const decimalString = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
        ? String(value)
        : '0';
    const mapped: Record<string, unknown> = {
      ...entry,
      amount: decimalString(entry.amount),
      runningBalance: decimalString(entry.runningBalance),
    };
    if ('quantity' in entry)
      mapped.quantity = entry.quantity == null ? null : Number(entry.quantity);
    if ('shiftId' in entry) mapped.shiftId = entry.shiftId ?? null;
    if ('shiftBusinessDate' in entry) mapped.shiftBusinessDate = entry.shiftBusinessDate ?? null;
    if ('shiftSequence' in entry)
      mapped.shiftSequence = entry.shiftSequence == null ? null : Number(entry.shiftSequence);
    if ('productName' in entry) mapped.productName = entry.productName ?? null;
    if ('unit' in entry) mapped.unit = entry.unit ?? null;
    if ('vehicleRegistration' in entry)
      mapped.vehicleRegistration = entry.vehicleRegistration ?? null;
    if ('invoiceNumber' in entry) mapped.invoiceNumber = entry.invoiceNumber ?? null;
    if ('tankerNumber' in entry) mapped.tankerNumber = entry.tankerNumber ?? null;
    if ('method' in entry) mapped.method = entry.method ?? null;
    if ('reference' in entry) mapped.reference = entry.reference ?? null;
    if ('fundingAccountName' in entry) mapped.fundingAccountName = entry.fundingAccountName ?? null;
    return mapped;
  });
}

export class DrizzleCustomerLedgerReader {
  constructor(private readonly db: DbClient) {}

  async statement(
    organizationId: string,
    customerId: string,
    { from, to }: PartyLedgerRange,
  ): Promise<RangedPartyLedger> {
    const [statement] = (await this.db.execute(sql`
      WITH entries AS (
        SELECT
          ct.id,
          ct.transaction_type AS "transactionType",
          ct.amount::text AS amount,
          bd.business_date AS "businessDate",
          ct.notes,
          ct.created_at AS "createdAt",
          ct.shift_id AS "shiftId",
          shift_day.business_date AS "shiftBusinessDate",
          CASE WHEN ct.shift_id IS NULL THEN NULL ELSE ${shiftSequenceSql('s')} END AS "shiftSequence",
          pr.name AS "productName",
          ct.quantity,
          pr.unit,
          cv.registration_number AS "vehicleRegistration",
          NULL::text AS method,
          NULL::text AS reference,
          NULL::text AS "fundingAccountName",
          CASE WHEN ct.transaction_type = 'Collection' THEN -ct.amount ELSE ct.amount END::numeric AS signed_amount,
          1::int AS sort_order
        FROM customer_transactions ct
        JOIN business_days bd
          ON bd.id = ct.business_day_id
         AND bd.organization_id = ${organizationId}
        LEFT JOIN shifts s
          ON s.id = ct.shift_id AND s.organization_id = bd.organization_id
        LEFT JOIN business_days shift_day
          ON shift_day.id = s.business_day_id
         AND shift_day.organization_id = bd.organization_id
        LEFT JOIN products pr ON pr.id = ct.product_id
        LEFT JOIN customer_vehicles cv ON cv.id = ct.vehicle_id
        WHERE bd.organization_id = ${organizationId}
          AND ct.customer_id = ${customerId}
          AND ct.transaction_type NOT IN ('OMC Sale', 'Collection')
          AND bd.business_date >= ${from}
          AND bd.business_date <= ${to}
        UNION ALL
        SELECT
          co.id,
          'Collection'::text AS "transactionType",
          co.amount::text AS amount,
          co.entry_date AS "businessDate",
          co.notes,
          co.created_at AS "createdAt",
          NULL::uuid AS "shiftId",
          NULL::varchar AS "shiftBusinessDate",
          NULL::int AS "shiftSequence",
          NULL::varchar AS "productName",
          NULL::numeric AS quantity,
          NULL::varchar AS unit,
          NULL::varchar AS "vehicleRegistration",
          co.payment_method AS method,
          co.document_number AS reference,
          fa.name AS "fundingAccountName",
          -co.amount::numeric AS signed_amount,
          2::int AS sort_order
        FROM collections co
        LEFT JOIN financial_accounts fa
          ON fa.id = co.funding_account_id AND fa.organization_id = co.organization_id
        WHERE co.organization_id = ${organizationId}
          AND co.customer_id = ${customerId}
          AND co.entry_date >= ${from}
          AND co.entry_date <= ${to}
      ),
      opening AS (
        SELECT COALESCE(SUM(signed_amount), 0)::numeric AS balance FROM (
          SELECT CASE WHEN ct.transaction_type = 'Collection' THEN -ct.amount ELSE ct.amount END AS signed_amount
          FROM customer_transactions ct
          JOIN business_days bd
            ON bd.id = ct.business_day_id AND bd.organization_id = ${organizationId}
          WHERE bd.organization_id = ${organizationId}
            AND ct.customer_id = ${customerId}
            AND ct.transaction_type NOT IN ('OMC Sale', 'Collection')
            AND bd.business_date < ${from}
          UNION ALL
          SELECT -co.amount AS signed_amount
          FROM collections co
          WHERE co.organization_id = ${organizationId}
            AND co.customer_id = ${customerId}
            AND co.entry_date < ${from}
        ) prior_entries
      ),
      ranged AS (
        SELECT entries.*,
          SUM(signed_amount) OVER (ORDER BY "businessDate", "createdAt", sort_order, id ROWS UNBOUNDED PRECEDING) AS range_balance
        FROM entries
      )
      SELECT
        opening.balance::text AS "periodOpeningBalance",
        (opening.balance + COALESCE((SELECT range_balance FROM ranged ORDER BY "businessDate" DESC, "createdAt" DESC, sort_order DESC, id DESC LIMIT 1), 0))::text AS "closingBalance",
        COALESCE((SELECT json_agg(json_build_object(
          'id', ranged.id, 'transactionType', ranged."transactionType", 'amount', ranged.amount,
          'businessDate', ranged."businessDate", 'runningBalance', (opening.balance + ranged.range_balance)::text,
          'notes', ranged.notes, 'createdAt', ranged."createdAt", 'shiftId', ranged."shiftId",
          'shiftBusinessDate', ranged."shiftBusinessDate", 'shiftSequence', ranged."shiftSequence",
          'productName', ranged."productName", 'quantity', ranged.quantity::text, 'unit', ranged.unit,
          'vehicleRegistration', ranged."vehicleRegistration", 'method', ranged.method,
          'reference', ranged.reference, 'fundingAccountName', ranged."fundingAccountName"
        ) ORDER BY ranged."businessDate", ranged."createdAt", ranged.sort_order, ranged.id) FROM ranged), '[]'::json) AS entries
      FROM opening
    `)) as unknown as Array<RangedPartyLedger>;
    return {
      periodOpeningBalance: String(statement?.periodOpeningBalance ?? '0'),
      closingBalance: String(statement?.closingBalance ?? statement?.periodOpeningBalance ?? '0'),
      entries: mapPartyLedgerEntries(statement?.entries ?? []),
    };
  }
}

export class DrizzleSupplierLedgerReader {
  constructor(private readonly db: DbClient) {}

  async statement(
    organizationId: string,
    supplierId: string,
    { from, to }: PartyLedgerRange,
  ): Promise<RangedPartyLedger> {
    const [statement] = (await this.db.execute(sql`
      WITH entries AS (
        SELECT
          st.id,
          st.transaction_type AS "transactionType",
          st.amount::text AS amount,
          st.entry_date AS "businessDate",
          st.notes,
          st.created_at AS "createdAt",
          fa.name AS "fundingAccountName",
          p.invoice_number AS "invoiceNumber",
          pi.product_name AS "productName",
          pi.quantity,
          pi.unit,
          NULL::text AS "tankerNumber",
          CASE WHEN st.transaction_type = 'Payment' THEN fa.account_type ELSE NULL END AS method,
          p.invoice_number AS reference,
          CASE WHEN st.transaction_type = 'Payment' THEN -st.amount ELSE st.amount END AS signed_amount
        FROM supplier_transactions st
        LEFT JOIN financial_accounts fa
          ON fa.id = st.funding_account_id AND fa.organization_id = st.organization_id
        LEFT JOIN purchases p
          ON p.id = st.reference_id
         AND st.reference_type = 'PURCHASE'
         AND p.supplier_id = st.supplier_id
         AND EXISTS (
           SELECT 1 FROM business_days purchase_day
           WHERE purchase_day.id = p.business_day_id
             AND purchase_day.organization_id = st.organization_id
         )
        LEFT JOIN business_days bd
          ON bd.id = p.business_day_id AND bd.organization_id = st.organization_id
        LEFT JOIN LATERAL (
          SELECT STRING_AGG(DISTINCT pr.name, ', ' ORDER BY pr.name) AS product_name,
                 CASE WHEN COUNT(DISTINCT pr.unit) = 1 THEN SUM(pit.quantity)::text ELSE NULL END AS quantity,
                 CASE WHEN COUNT(DISTINCT pr.unit) = 1 THEN MIN(pr.unit) ELSE NULL END AS unit
          FROM purchase_items pit
          JOIN products pr ON pr.id = pit.product_id
          WHERE pit.purchase_id = p.id AND bd.id IS NOT NULL
          HAVING COUNT(*) > 0
        ) pi ON true
        WHERE st.organization_id = ${organizationId}
          AND st.supplier_id = ${supplierId}
          AND st.entry_date >= ${from}
          AND st.entry_date <= ${to}
      ),
      opening AS (
        SELECT COALESCE(SUM(CASE WHEN st.transaction_type = 'Payment' THEN -st.amount ELSE st.amount END), 0)::numeric AS balance
        FROM supplier_transactions st
        WHERE st.organization_id = ${organizationId}
          AND st.supplier_id = ${supplierId}
          AND st.entry_date < ${from}
      ),
      ranged AS (
        SELECT entries.*,
          SUM(signed_amount) OVER (ORDER BY "businessDate", "createdAt", id ROWS UNBOUNDED PRECEDING) AS range_balance
        FROM entries
      )
      SELECT
        opening.balance::text AS "periodOpeningBalance",
        (opening.balance + COALESCE((SELECT range_balance FROM ranged ORDER BY "businessDate" DESC, "createdAt" DESC, id DESC LIMIT 1), 0))::text AS "closingBalance",
        COALESCE((SELECT json_agg(json_build_object(
          'id', ranged.id, 'transactionType', ranged."transactionType", 'amount', ranged.amount,
          'businessDate', ranged."businessDate", 'runningBalance', (opening.balance + ranged.range_balance)::text,
          'notes', ranged.notes, 'createdAt', ranged."createdAt", 'invoiceNumber', ranged."invoiceNumber",
          'productName', ranged."productName", 'quantity', ranged.quantity, 'unit', ranged.unit,
          'tankerNumber', ranged."tankerNumber", 'method', ranged.method, 'reference', ranged.reference,
          'fundingAccountName', ranged."fundingAccountName"
        ) ORDER BY ranged."businessDate", ranged."createdAt", ranged.id) FROM ranged), '[]'::json) AS entries
      FROM opening
    `)) as unknown as Array<RangedPartyLedger>;
    return {
      periodOpeningBalance: String(statement?.periodOpeningBalance ?? '0'),
      closingBalance: String(statement?.closingBalance ?? statement?.periodOpeningBalance ?? '0'),
      entries: mapPartyLedgerEntries(statement?.entries ?? []),
    };
  }
}
