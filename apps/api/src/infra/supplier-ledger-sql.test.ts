import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { supplierSignedAmount } from './supplier-ledger-sql.js';

describe('supplierSignedAmount', () => {
  it('subtracts a Payment and adds every other row', () => {
    expect(new PgDialect().sqlToQuery(sql`SELECT ${supplierSignedAmount('st')}`).sql).toBe(
      "SELECT CASE WHEN st.transaction_type = 'Payment' THEN -st.amount ELSE st.amount END",
    );
  });

  it('refuses an alias that is not a plain identifier', () => {
    expect(() => supplierSignedAmount('st; DROP TABLE x')).toThrow();
  });
});
