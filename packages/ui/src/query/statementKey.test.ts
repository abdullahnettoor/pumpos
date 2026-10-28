import { describe, expect, it } from 'vite-plus/test';
import { isStatementKey, queryKeys } from './hooks.js';

describe('isStatementKey', () => {
  it('recognises the keys the statement builders make', () => {
    expect(isStatementKey(queryKeys.customerStatement('c1', '2026-10-01', '2026-10-09'))).toBe(
      true,
    );
    expect(
      isStatementKey(queryKeys.supplierStatement('s1', '2026-10-01', '2026-10-09', 'st-1')),
    ).toBe(true);
  });

  it('refuses other keys, and the prefix keys that name no window', () => {
    expect(isStatementKey(undefined)).toBe(false);
    expect(isStatementKey(queryKeys.customerStatements('c1'))).toBe(false);
    expect(isStatementKey(queryKeys.customerLedger('c1'))).toBe(false);
    expect(isStatementKey(['customer-statement', 'c1', 1, 2])).toBe(false);
    // A supplier window names its Station (#575).
    expect(isStatementKey(['supplier-statement', 's1', '2026-10-01', '2026-10-09'])).toBe(false);
    expect(isStatementKey(queryKeys.supplierStatements('s1'))).toBe(false);
  });
});
