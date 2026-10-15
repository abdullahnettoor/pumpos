import type { WriteEntry } from '../../query/pendingWrites.js';
import type {
  OfficeRecordVariables,
  VoidRecordVariables,
} from '../../office-records/useRecordOfficeRecord.js';
import type { CategoryRecord } from './categoryRecordColumns.js';
import type { CategoryRecordKind } from './CategoryManagerDrawer.js';

/**
 * The ledger's rows while Expense / Income writes are in flight (#606), from
 * the writes themselves (`useWriteStates`).
 */

/** An Office Record save of this kind at this station (`scope` = `kind:stationId`), by its key. */
export const recordWriteKey = (v: OfficeRecordVariables, scope: string): string | null =>
  `${v.kind}:${v.stationId}` === scope ? v.idempotencyKey : null;

/** A void of this kind, by the entry it voids. */
export const voidWriteKey = (v: VoidRecordVariables, kind: CategoryRecordKind): string | null =>
  v.kind === kind ? v.id : null;

/**
 * A row for each entry still saving, ahead of the ledger. It carries what the
 * operator chose (date, category, description, account), never an amount: the
 * amount reads "Saving…" until the server confirms it. A refused save is not
 * listed (the drawer says why); the answer itself replaces the row (step 1).
 */
export function savingRecordRows(
  writes: ReadonlyMap<string, WriteEntry<OfficeRecordVariables>>,
): CategoryRecord[] {
  const rows: CategoryRecord[] = [];
  for (const [key, w] of writes) {
    if (w.state !== 'saving') continue;
    const body = w.variables.request.body as {
      entryDate?: string;
      categoryId?: string;
      description?: string;
    };
    rows.push({
      id: `saving:${key}`,
      entryDate: body.entryDate ?? null,
      categoryId: body.categoryId ?? null,
      categoryName: w.variables.labels.categoryName ?? null,
      description: body.description ?? null,
      accountName: w.variables.labels.accountName ?? null,
      accountType: w.variables.labels.accountType ?? null,
      amount: 0,
      write: w,
      unsaved: true,
    });
  }
  return rows;
}

/** The ledger's rows with their void in flight or refused, if any. */
export function withVoidWrites(
  rows: CategoryRecord[],
  writes: ReadonlyMap<string, WriteEntry<VoidRecordVariables>>,
): CategoryRecord[] {
  if (writes.size === 0) return rows;
  return rows.map((r) => {
    const write = writes.get(r.id);
    return write ? { ...r, write } : r;
  });
}
