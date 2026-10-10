import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { onCustomerLedger } from './customer-ledger-sql.js';

const render = (fragment: ReturnType<typeof onCustomerLedger>) =>
  new PgDialect().sqlToQuery(sql`SELECT 1 WHERE ${fragment}`).sql;

describe('onCustomerLedger', () => {
  it('keeps OMC fleet-card sales and legacy Collection rows off the ledger', () => {
    expect(render(onCustomerLedger('ct'))).toBe(
      "SELECT 1 WHERE ct.transaction_type NOT IN ('OMC Sale', 'Collection')",
    );
  });

  it('refuses an alias that is not a plain identifier', () => {
    expect(() => onCustomerLedger('ct; DROP TABLE x')).toThrow();
  });
});
