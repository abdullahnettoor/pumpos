import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  dssrDaySales,
  dssrFuelSalesValue,
  dssrNetVolume,
  dssrProductSalesValue,
} from './dssr-snapshot-sql.js';

const render = (fragment: ReturnType<typeof dssrNetVolume>) =>
  new PgDialect().sqlToQuery(fragment).sql.replace(/\s+/g, ' ');

describe('dssr-snapshot-sql', () => {
  it('reads the day sales figures from the snapshot paths composeDssr writes', () => {
    expect(render(dssrFuelSalesValue('ds.snapshot_data'))).toContain(
      "ds.snapshot_data -> 'fuel' ->> 'totalSalesValue'",
    );
    expect(render(dssrProductSalesValue('ds.snapshot_data'))).toContain(
      "ds.snapshot_data -> 'merchandise' ->> 'salesValue'",
    );
    const day = render(dssrDaySales('ds.snapshot_data'));
    expect(day).toContain("'totalSalesValue'");
    expect(day).toContain("'salesValue'");
  });

  it('falls back to gross minus testing, never bare gross, for a snapshot without net volume', () => {
    const volume = render(dssrNetVolume('sn.data'));
    expect(volume).toContain("sn.data -> 'fuel' ->> 'totalNetVolume'");
    expect(volume).toContain("'totalGrossVolume'");
    expect(volume).toContain("'totalVolume'");
    expect(volume).toMatch(
      /- COALESCE\(\(sn\.data -> 'fuel' ->> 'totalTestingVolume'\)::numeric, 0\)/,
    );
  });

  it('accepts only a trusted alias.column reference', () => {
    expect(() => dssrNetVolume('ds.snapshot_data; drop table x')).toThrow();
    expect(() => dssrFuelSalesValue('snapshot_data')).toThrow();
  });
});
