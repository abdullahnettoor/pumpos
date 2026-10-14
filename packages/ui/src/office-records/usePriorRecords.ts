import { useEffect, useMemo, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { queryKeys } from '../query/hooks.js';
import type { OfficeRecordKind } from './kinds.js';
import type { PriorRecord } from './preview.js';

interface PriorSource {
  /** The list's query key prefix (every cached page of it). */
  prefix: QueryKey;
  /** The category or party a repeat must share. */
  match: (row: any) => string | null;
}

const SOURCES: Partial<Record<OfficeRecordKind, PriorSource>> = {
  expense: { prefix: queryKeys.expenses(), match: (r) => r.categoryId ?? null },
  income: { prefix: queryKeys.income().slice(0, 1), match: (r) => r.categoryId ?? null },
  collection: { prefix: queryKeys.collections(), match: (r) => r.customerId ?? null },
  purchase: { prefix: queryKeys.purchases(), match: (r) => r.supplierId ?? null },
};

/**
 * Does this cached row belong to the station? A row that names its station
 * must name this one; a row that doesn't (income) counts only from a list
 * whose key names the station.
 */
const atStation = (row: any, key: QueryKey, stationId: string) =>
  row.stationId != null ? row.stationId === stationId : key.includes(stationId);

/**
 * Records of this kind at this station the client already holds, for the
 * repeat check. Read from the cache only: opening the drawer never fetches a
 * list for a warning, but a list that loads while it is open is picked up.
 * Supplier payments have no client list, so they get no repeat check.
 */
export function usePriorRecords(kind: OfficeRecordKind, stationId: string): PriorRecord[] {
  const qc = useQueryClient();
  const source = SOURCES[kind];
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!source) return;
    const head = source.prefix[0];
    return qc.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' || event.type === 'added' || event.type === 'removed') {
        if (event.query.queryKey[0] === head) setVersion((v) => v + 1);
      }
    });
  }, [qc, source]);

  return useMemo(() => {
    void version;
    if (!source) return [];
    const out: PriorRecord[] = [];
    for (const [key, data] of qc.getQueriesData<any[]>({ queryKey: source.prefix })) {
      if (!Array.isArray(data)) continue;
      for (const r of data) {
        if (!r || r.status === 'VOIDED' || !atStation(r, key, stationId)) continue;
        const amount = Number(r.amount ?? r.totalAmount);
        const date = r.entryDate ?? r.businessDate;
        if (!date || !Number.isFinite(amount)) continue;
        out.push({ date: String(date).slice(0, 10), amount, matchId: source.match(r) });
      }
    }
    return out;
  }, [qc, source, stationId, version]);
}
