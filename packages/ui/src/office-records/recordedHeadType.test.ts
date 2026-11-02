import { describe, expect, it } from 'vite-plus/test';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query/hooks.js';
import { splitByNature } from '../components/categories/natureTotals.js';
import { savingRecordRows } from '../components/categories/categoryRecordWrites.js';
import { officeRecordLabels, patchOfficeRecordLists } from './useRecordOfficeRecord.js';
import type { OfficeRecordSubmission } from './send.js';

/**
 * A saved Direct entry lands in the Direct total as soon as its answer is
 * patched into the list, before the background refetch revalidates (#685).
 */

const STATION = 'st-1';
const heads = [
  { id: 'diesel', name: 'Generator Diesel', nature: 'DIRECT' as const },
  { id: 'tea', name: 'Tea', nature: 'INDIRECT' as const },
  { id: 'commission', name: 'Commission', nature: 'DIRECT' as const },
];
const lookups = { categories: heads, accounts: [], parties: [] };

const answer = (id: string, amount: string) => ({
  id,
  stationId: STATION,
  entryDate: '2026-03-15',
  amount,
  createdAt: '2026-03-15T10:00:00Z',
  status: 'RECORDED',
});

const submission = (categoryId: string) =>
  ({ values: { categoryId } }) as unknown as OfficeRecordSubmission;

describe("a recorded entry carries its head's Type", () => {
  it('lands a Direct expense in the Direct total before the list revalidates', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.expenses(), []);
    const labels = officeRecordLabels(submission('diesel'), lookups);
    patchOfficeRecordLists(
      qc,
      { stationId: STATION, kind: 'expense', labels },
      answer('e1', '100'),
    );
    const list = qc.getQueryData<any[]>(queryKeys.expenses())!;
    expect(splitByNature(list)).toEqual({ direct: 100, indirect: 0, grand: 100 });
  });

  it('lands a Direct income entry in the Direct total before the list revalidates', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.income(STATION, '2026-03-01', '2026-03-31'), []);
    const labels = officeRecordLabels(submission('commission'), lookups);
    patchOfficeRecordLists(qc, { stationId: STATION, kind: 'income', labels }, answer('i1', '250'));
    const list = qc.getQueryData<any[]>(queryKeys.income(STATION, '2026-03-01', '2026-03-31'))!;
    expect(splitByNature(list)).toEqual({ direct: 250, indirect: 0, grand: 250 });
  });

  it('keeps an Indirect head Indirect, and a head without a Type Indirect', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.expenses(), []);
    const tea = officeRecordLabels(submission('tea'), lookups);
    const unknown = officeRecordLabels(submission('gone'), lookups);
    patchOfficeRecordLists(
      qc,
      { stationId: STATION, kind: 'expense', labels: tea },
      answer('e1', '30'),
    );
    patchOfficeRecordLists(
      qc,
      { stationId: STATION, kind: 'expense', labels: unknown },
      answer('e2', '20'),
    );
    const list = qc.getQueryData<any[]>(queryKeys.expenses())!;
    expect(splitByNature(list)).toEqual({ direct: 0, indirect: 50, grand: 50 });
  });

  it("shows a still-saving row under its head's Type", () => {
    const labels = officeRecordLabels(submission('diesel'), lookups);
    const writes = new Map([
      [
        'k1',
        {
          state: 'saving',
          variables: { stationId: STATION, kind: 'expense', labels, request: { body: {} } },
        },
      ],
    ]) as any;
    expect(savingRecordRows(writes)[0].categoryNature).toBe('DIRECT');
  });
});
