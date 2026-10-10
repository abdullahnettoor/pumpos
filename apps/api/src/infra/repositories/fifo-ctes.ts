import { sql, type SQL } from 'drizzle-orm';

/** Shared running-debit / total-credit FIFO used by receivables and payables. */
export function fifoCtes(input: { ledger: SQL; entityColumn: 'customer_id' | 'supplier_id' }) {
  const entity = sql.raw(input.entityColumn);
  return sql`
    source_ledger AS (${input.ledger}),
    ledger AS (SELECT * FROM source_ledger),
    credits AS (SELECT *, -signed AS amount FROM source_ledger WHERE signed < 0),
    debit_cum AS (
      SELECT l.*,
        SUM(l.signed) OVER (
          PARTITION BY l.${entity} ORDER BY l.date, l.created_at, l.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cum_debit
      FROM source_ledger l
      WHERE l.signed > 0
    ),
    credit_total AS MATERIALIZED (
      SELECT ${entity}, SUM(-signed) AS total
      FROM credits GROUP BY ${entity}
    ),
    open_debits AS (
      SELECT dc.*,
        LEAST(dc.signed, GREATEST(0, dc.cum_debit - COALESCE(ct.total, 0))) AS open_amount
      FROM debit_cum dc
      LEFT JOIN credit_total ct ON ct.${entity} = dc.${entity}
    )`;
}
