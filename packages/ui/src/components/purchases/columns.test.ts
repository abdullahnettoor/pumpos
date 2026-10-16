import { describe, expect, it } from 'vitest';
import { buildPurchaseColumns } from './columns.js';

describe('buildPurchaseColumns', () => {
  it('shows the Amount column with View purchase prices / costs', () => {
    expect(buildPurchaseColumns(undefined, true).map((c) => c.id)).toContain('amount');
  });
  it('drops the Amount column without it', () => {
    expect(buildPurchaseColumns(undefined, false).map((c) => c.id)).not.toContain('amount');
  });
});
