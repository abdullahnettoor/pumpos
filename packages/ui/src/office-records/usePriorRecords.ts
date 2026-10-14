import { useQueryClient } from '@tanstack/react-query';
import type { OfficeRecordKind } from './kinds.js';
import type { PriorRecord } from './preview.js';

const PREFIX: Partial<Record<OfficeRecordKind, readonly string[]>> = {
  expense: ['expenses'],
  income: ['income'],
  collection: ['collections'],
  purchase: ['purchases'],
};

const MATCH: Partial<Record<OfficeRecordKind, (row: any) => string | null>> = {
  expense: (r) => r.categoryId ?? null,
  income: (r) => r.categoryId ?? null,
  collection: (r) => r.customerId ?? null,
  purchase: (r) => r.supplierId ?? null,
};

/**
 * Records of this kind the client already holds, for the repeat check. Read
 * from the cache only: opening the drawer never fetches a list for a warning.
 * Supplier payments have no client list, so they get no repeat check.
 */
export function usePriorRecords(kind: OfficeRecordKind): PriorRecord[] {
  const qc = useQueryClient();
  const prefix = PREFIX[kind];
  const match = MATCH[kind];
  if (!prefix || !match) return [];
  const out: PriorRecord[] = [];
  for (const [, data] of qc.getQueriesData<any[]>({ queryKey: [...prefix] })) {
    if (!Array.isArray(data)) continue;
    for (const r of data) {
      if (!r || r.status === 'VOIDED') continue;
      const amount = Number(r.amount ?? r.totalAmount);
      const date = r.entryDate ?? r.businessDate;
      if (!date || !Number.isFinite(amount)) continue;
      out.push({ date: String(date).slice(0, 10), amount, matchId: match(r) });
    }
  }
  return out;
}
