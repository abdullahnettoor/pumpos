import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  dssrCreditTotal,
  dssrDaySales,
  dssrNetVolumeOfRecord,
  jsonbArray,
  uuidOrNull,
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

  it('reads credit.total and a recordset net volume with the same gross-less-testing fallback', () => {
    expect(render(dssrCreditTotal('ds.snapshot_data'))).toContain(
      "ds.snapshot_data -> 'credit' ->> 'total'",
    );
    const net = render(dssrNetVolumeOfRecord('f'));
    expect(net).toContain('f."netVolume"');
    expect(net).toContain('f."grossVolume"');
    expect(net).toContain('f."testingVolume"');
    expect(() => dssrNetVolumeOfRecord('f; drop table x')).toThrow();
  });

  it('reads a non-array jsonb path as empty without interpolating raw text', () => {
    const out = render(jsonbArray(sql`ds.snapshot_data -> 'fuel' -> 'nozzles'`));
    expect(out).toContain("jsonb_typeof(ds.snapshot_data -> 'fuel' -> 'nozzles') = 'array'");
    expect(out).toContain("'[]'::jsonb");
  });

  it('casts a snapshot uuid only when it is well formed', () => {
    const out = render(uuidOrNull('d."attendantId"'));
    expect(out).toContain('CASE WHEN d."attendantId" ~*');
    expect(out).toContain('d."attendantId"::uuid');
    expect(() => uuidOrNull('x; drop')).toThrow();
  });
});
