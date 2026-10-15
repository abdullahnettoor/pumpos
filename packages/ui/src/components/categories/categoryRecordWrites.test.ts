import { describe, expect, it } from 'vitest';
import type { WriteEntry } from '../../query/pendingWrites.js';
import type {
  OfficeRecordVariables,
  VoidRecordVariables,
} from '../../office-records/useRecordOfficeRecord.js';
import {
  recordWriteKey,
  savingRecordRows,
  voidWriteKey,
  withVoidWrites,
} from './categoryRecordWrites.js';

const saving = (over: Partial<OfficeRecordVariables> = {}): WriteEntry<OfficeRecordVariables> => ({
  state: 'saving',
  error: null,
  submittedAt: 1,
  variables: {
    stationId: 'st-1',
    kind: 'expense',
    idempotencyKey: 'k-1',
    labels: { categoryName: 'Electricity', accountName: 'Cash in Hand', accountType: 'CASH' },
    request: {
      kind: 'expense',
      body: { entryDate: '2026-10-14', categoryId: 'c1', amount: 1500, description: 'KSEB' },
      send: () => Promise.resolve(null),
    },
    ...over,
  },
});

describe('the ledger while writes are in flight (#606)', () => {
  it('lists an entry still saving with what was chosen, never its amount', () => {
    const rows = savingRecordRows(new Map([['k-1', saving()]]));
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'saving:k-1',
        entryDate: '2026-10-14',
        categoryName: 'Electricity',
        description: 'KSEB',
        accountName: 'Cash in Hand',
        unsaved: true,
      }),
    ]);
    // No figure until the server confirms it: the amount cell reads "Saving…".
    expect(rows[0].amount).toBe(0);
  });

  it('does not list a refused save (the drawer says why)', () => {
    const failed = { ...saving(), state: 'failed' as const, error: new Error('x') };
    expect(savingRecordRows(new Map([['k-1', failed]]))).toEqual([]);
  });

  it('keys writes by kind and station; voids by the entry they void', () => {
    expect(recordWriteKey(saving().variables, 'expense:st-1')).toBe('k-1');
    expect(recordWriteKey(saving().variables, 'income:st-1')).toBeNull();
    expect(recordWriteKey(saving().variables, 'expense:st-2')).toBeNull();
    const v: VoidRecordVariables = {
      kind: 'income',
      id: 'r9',
      stationId: 'st-1',
      idempotencyKey: 'k',
    };
    expect(voidWriteKey(v, 'income')).toBe('r9');
    expect(voidWriteKey(v, 'expense')).toBeNull();
  });

  it('marks only the row whose void is in flight', () => {
    const rows = [
      { id: 'a', amount: '1' },
      { id: 'b', amount: '2' },
    ];
    const write: WriteEntry<VoidRecordVariables> = {
      state: 'saving',
      error: null,
      submittedAt: 1,
      variables: { kind: 'expense', id: 'b', stationId: 'st-1', idempotencyKey: 'k' },
    };
    const out = withVoidWrites(rows, new Map([['b', write]]));
    expect(out[0]).toBe(rows[0]);
    expect(out[1].write).toBe(write);
    expect(withVoidWrites(rows, new Map())).toBe(rows);
  });
});
