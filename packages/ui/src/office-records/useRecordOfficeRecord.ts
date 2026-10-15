import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { mutationKeys, queryKeys } from '../query/hooks.js';
import { patchQueriesData, patchQueryData } from '../query/patches/applyPatch.js';
import {
  collectionRow,
  expenseRow,
  incomeRow,
  inRangeKey,
  insertRecord,
  supplierPaymentRow,
  withVoidedRecord,
  type AnsweredRecord,
  type RecordLabels,
} from '../query/patches/officeRecords.js';
import { CloudTransactionService } from '../services/cloud.js';
import type { OfficeRecordKind } from './kinds.js';
import type { OfficeRecordRequest, OfficeRecordSubmission } from './send.js';

/** What one Office Record save carries: enough for its list to show it "Saving…" (#606). */
export interface OfficeRecordVariables {
  stationId: string;
  kind: OfficeRecordKind;
  request: OfficeRecordRequest;
  idempotencyKey: string;
  /** Names its list row shows that the answer does not carry. */
  labels: RecordLabels;
}

type Rows = { id: string }[];

/**
 * The saved record into its cached list (#606): Expenses, Income, Collections
 * and Supplier payments get the row from the answer; a Purchase is left to the
 * background refetch (its list row needs what the answer does not carry).
 */
export function patchOfficeRecordLists(
  qc: QueryClient,
  vars: Pick<OfficeRecordVariables, 'stationId' | 'kind' | 'labels'>,
  answer: unknown,
): void {
  const record = answer as AnsweredRecord | null | undefined;
  if (!record?.id || !record.entryDate) return;
  const { stationId, labels } = vars;
  switch (vars.kind) {
    case 'expense':
      patchQueryData<Rows>(qc, queryKeys.expenses(), (list) =>
        insertRecord(list, expenseRow(record, labels)),
      );
      return;
    case 'income':
      patchQueriesData<Rows>(qc, { queryKey: queryKeys.incomePrefix(stationId) }, (list, key) =>
        inRangeKey(key, record) ? insertRecord(list, incomeRow(record, labels), 'createdAt') : list,
      );
      return;
    case 'collection':
      patchQueryData<Rows>(qc, queryKeys.collections(), (list) =>
        insertRecord(list, collectionRow(record, labels)),
      );
      return;
    case 'supplier-payment':
      patchQueriesData<Rows>(
        qc,
        { queryKey: queryKeys.supplierPaymentsPrefix(stationId) },
        (list, key) =>
          inRangeKey(key, record) ? insertRecord(list, supplierPaymentRow(record, labels)) : list,
      );
      return;
    case 'purchase':
      return;
  }
}

/**
 * The one Office Record write (#526, #606). Keyed by the caller's session; the
 * answer goes into its list at once, and the caller starts the operational
 * refresh in the background. `onSuccess` stays synchronous (caching rule 6).
 */
export function useRecordOfficeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.officeRecord(),
    mutationFn: (vars: OfficeRecordVariables) => vars.request.send(vars.idempotencyKey),
    onSuccess: (answer: unknown, vars: OfficeRecordVariables): void => {
      patchOfficeRecordLists(qc, vars, answer);
    },
  });
}

/** Lookups the drawer already holds, for naming the saved row. */
export interface OfficeRecordLookups {
  categories: readonly { id: string; name: string }[];
  accounts: readonly { id: string; name: string; accountType?: string | null }[];
  parties: readonly { id: string; name: string }[];
}

/** The names a saved record's list row shows, from the records the operator picked. */
export function officeRecordLabels(
  submission: OfficeRecordSubmission,
  lookups: OfficeRecordLookups,
): RecordLabels {
  const v = submission.values as Record<string, unknown>;
  const account = lookups.accounts.find((a) => a.id === v.fundingAccountId);
  const partyId = v.customerId ?? v.supplierId;
  return {
    categoryName: lookups.categories.find((c) => c.id === v.categoryId)?.name ?? null,
    accountName: account?.name ?? null,
    accountType: account?.accountType ?? null,
    partyName: partyId ? (lookups.parties.find((p) => p.id === partyId)?.name ?? null) : null,
  };
}

const service = new CloudTransactionService();

/** Voiding an Expense or Income entry (#606): keyed, and its row reads Voided from the answer. */
export interface VoidRecordVariables {
  kind: 'expense' | 'income';
  id: string;
  stationId: string | null;
  reason?: string;
  idempotencyKey: string;
}

export function useVoidCategoryRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.voidOfficeRecord(),
    mutationFn: ({ kind, id, reason, idempotencyKey }: VoidRecordVariables) =>
      kind === 'expense'
        ? service.voidExpense(id, reason, { idempotencyKey })
        : service.voidIncome(id, reason, { idempotencyKey }),
    onSuccess: (answer: unknown, vars: VoidRecordVariables): void => {
      const record = answer as AnsweredRecord | null | undefined;
      if (!record?.id || !record.status) return;
      if (vars.kind === 'expense') {
        patchQueryData<Rows>(qc, queryKeys.expenses(), (list) => withVoidedRecord(list, record));
      } else if (vars.stationId) {
        patchQueriesData<Rows>(qc, { queryKey: queryKeys.incomePrefix(vars.stationId) }, (list) =>
          withVoidedRecord(list, record),
        );
      }
    },
  });
}
