/**
 * Patches for the Office Record lists (#606) from a write's own answer:
 * Expenses (`queryKeys.expenses()`), Income (`queryKeys.income(station, from,
 * to)`), Collections (`queryKeys.collections()`) and Supplier payments
 * (`queryKeys.supplierPayments(station, from, to)`).
 *
 * Every figure and date comes from the answer. The answer does not carry the
 * names a row shows beside them (category, account, party), so the caller
 * passes those from the records the operator picked. A Purchase is not
 * patched: its list row needs the supplier's items summary and whether its
 * fuel awaits a Decantation, which the answer does not carry; it is left to
 * the background refetch.
 */

type Row = { id: string; [key: string]: unknown };

/** An Office Record as its write answers it (amounts as strings). */
export interface AnsweredRecord {
  id: string;
  stationId: string;
  entryDate: string;
  amount: string | number;
  createdAt: string;
  status?: string;
  [key: string]: unknown;
}

/** Names a row shows that the answer does not carry. */
export interface RecordLabels {
  /** Expense or Income category. */
  categoryName?: string | null;
  /** The Funding Account. */
  accountName?: string | null;
  accountType?: string | null;
  /** The customer (Collection) or supplier (Supplier payment). */
  partyName?: string | null;
}

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
/** A row's ISO date or timestamp, '' when absent. */
const iso = (v: unknown) => (typeof v === 'string' ? v : '');

/** Newest entry date first, then newest saved: how the server lists these ledgers. */
const byEntryDateDesc = (a: Row, b: Row) =>
  desc(iso(a.entryDate), iso(b.entryDate)) || desc(iso(a.createdAt), iso(b.createdAt));

/** Adds the row where the list's order puts it; a replayed answer is not listed twice. */
export function insertRecord<T extends Row>(
  list: T[],
  row: Row,
  order: 'entryDate' | 'createdAt' = 'entryDate',
): (T | Row)[] {
  if (list.some((r) => r.id === row.id)) return list;
  const before = (r: Row) =>
    order === 'entryDate'
      ? byEntryDateDesc(row, r) <= 0
      : desc(iso(row.createdAt), iso(r.createdAt)) <= 0;
  const at = list.findIndex((r) => before(r));
  return at < 0 ? [...list, row] : [...list.slice(0, at), row, ...list.slice(at)];
}

/** Whether a list cached for `[…, stationId, from, to]` holds this record. */
export function inRangeKey(queryKey: readonly unknown[], record: AnsweredRecord): boolean {
  const [, stationId, from, to] = queryKey as [unknown, string?, string?, string?];
  if (stationId && stationId !== record.stationId) return false;
  if (from && record.entryDate < from) return false;
  if (to && record.entryDate > to) return false;
  return true;
}

export function expenseRow(answer: AnsweredRecord, labels: RecordLabels): Row {
  return {
    ...answer,
    // As GET /transactions/expenses names an uncategorised one.
    categoryName: labels.categoryName ?? 'General',
    accountName: labels.accountName ?? null,
    accountType: labels.accountType ?? null,
  };
}

export function incomeRow(answer: AnsweredRecord, labels: RecordLabels): Row {
  return {
    ...answer,
    categoryName: labels.categoryName ?? null,
    accountName: labels.accountName ?? null,
    accountType: labels.accountType ?? null,
  };
}

export function collectionRow(answer: AnsweredRecord, labels: RecordLabels): Row {
  return {
    ...answer,
    customerName: labels.partyName ?? 'Walk-in Customer',
    accountName: labels.accountName ?? null,
  };
}

export function supplierPaymentRow(answer: AnsweredRecord, labels: RecordLabels): Row {
  return {
    id: answer.id,
    stationId: answer.stationId,
    supplierId: answer.supplierId,
    entryDate: answer.entryDate,
    amount: answer.amount,
    notes: answer.notes ?? null,
    createdAt: answer.createdAt,
    supplierName: labels.partyName ?? null,
    accountName: labels.accountName ?? null,
    accountType: labels.accountType ?? null,
  };
}

/** A voided record keeps its row, now with the status the void answered. */
export function withVoidedRecord<T extends Row>(list: T[], answer: AnsweredRecord): T[] {
  const at = list.findIndex((r) => r.id === answer.id);
  if (at < 0 || list[at].status === answer.status) return list;
  const next = [...list];
  next[at] = { ...list[at], status: answer.status };
  return next;
}
