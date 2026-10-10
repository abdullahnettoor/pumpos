import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CloudTransactionService, createIdempotencyKey, useInvalidateOperational } from '@pump/ui';
import {
  applyCollectionToCustomers,
  collectionFailure,
  collectionRequest,
  type CollectionFailure,
  type CollectionForm,
} from '../../lib/money/collection.js';
import { reusesIdempotencyKey } from '../../lib/money/creditLimit.js';

const service = new CloudTransactionService();

export type RecordCollectionResult = { ok: true } | { ok: false; failure: CollectionFailure };

/**
 * Records one Collection through the existing route
 * (`POST /transactions/collections`): an Office Record, so the body carries the
 * station, Entry Date and Funding Account and no shift.
 *
 * Caches (pump-data-caching): the customers list is semi tier, so a save writes
 * the lower balance into every cached list at once (the card and its Over /
 * Near limit state repaint in the same frame) and then `useInvalidateOperational`
 * refreshes the server's rows: customers, collections, account balances and the
 * Daily Cash Book. The Customer's ledger, statement and the receivables summary
 * (aging, last payment, usually-pays-in) read the same collections, so they are
 * invalidated by prefix too; a prefix nothing reads yet is a no-op. A refusal by
 * the access mode refreshes the Access Document on its own (the app's
 * QueryClient does that for every policy refusal).
 *
 * Idempotency: one key per logical save. The key is reused while the outcome is
 * unknown (a double tap, a network drop, a 5xx) so the payment cannot be
 * recorded twice, and replaced after a decided refusal (the API caches every
 * 2xx/4xx under its key) or when the entries change.
 */
export function useRecordCollection(stationId: string, customerId: string) {
  const qc = useQueryClient();
  const invalidateOperational = useInvalidateOperational();
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const inFlight = useRef<Promise<RecordCollectionResult> | null>(null);

  const mutation = useMutation({
    mutationFn: ({ form }: { form: CollectionForm }) => {
      const body = collectionRequest(stationId, customerId, form);
      const signature = JSON.stringify(body);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, key: createIdempotencyKey() };
      return service.recordCollection(body, { idempotencyKey: attempt.current.key });
    },
    onSuccess: (_saved, { form }) => {
      attempt.current = null;
      qc.setQueriesData<Array<{ id: string; currentBalance?: unknown }>>(
        { queryKey: ['customers'] },
        (list) => applyCollectionToCustomers(list, customerId, Number(form.amount.trim())),
      );
      void invalidateOperational(stationId);
      for (const prefix of ['customer-ledger', 'customer-statement', 'receivables'])
        void qc.invalidateQueries({ queryKey: [prefix] });
    },
    onError: (error) => {
      if (!reusesIdempotencyKey(error)) attempt.current = null;
    },
  });

  const save = (form: CollectionForm): Promise<RecordCollectionResult> => {
    // A second tap while the first is on its way is the same save, not another one.
    if (inFlight.current) return inFlight.current;
    const run = mutation
      .mutateAsync({ form })
      .then<RecordCollectionResult>(() => ({ ok: true }))
      .catch<RecordCollectionResult>((error) => ({ ok: false, failure: collectionFailure(error) }))
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    return run;
  };

  return { save, isSaving: mutation.isPending };
}
