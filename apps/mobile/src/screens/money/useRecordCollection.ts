import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CloudTransactionService,
  createIdempotencyKey,
  queryKeys,
  useInvalidateOperational,
} from '@pump/ui';
import {
  applyCollectionToCustomers,
  collectionFailure,
  collectionRequest,
  isEarlierAttemptReceived,
  keepsIdempotencyKey,
  type CollectionFailure,
  type CollectionForm,
} from '../../lib/money/collection.js';

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
 * Daily Cash Book. The Customer's ledger, statement (every cached window) and
 * receivable (aging, last payment, usually-pays-in) are invalidated through their
 * own centralized keys, so the page repaints even for a save from another screen. A refusal by the access mode
 * refreshes the Access Document on its own (the app's QueryClient does that for
 * every policy refusal).
 *
 * Idempotency: one key per logical save, kept until the outcome is DECIDED. While
 * it is unknown (a double tap, a network drop, a 5xx) the key survives every edit
 * of the form, so a retry, edited or not, cannot record the payment twice: the
 * API answers an edited retry of an attempt it received with a conflict (the
 * balance is then re-read) and treats one it never saw as new. A decided answer
 * (success, or a 4xx the API caches under its key) clears the key.
 * `unknownAttempt` is the entries of the attempt whose outcome is unknown, so the
 * sheet can warn that it may have gone through.
 */
export function useRecordCollection(stationId: string, customerId: string) {
  const qc = useQueryClient();
  const invalidateOperational = useInvalidateOperational();
  const key = useRef<string | null>(null);
  const inFlight = useRef<Promise<RecordCollectionResult> | null>(null);
  const [unknownAttempt, setUnknownAttempt] = useState<CollectionForm | null>(null);

  const refreshBalances = () => {
    void invalidateOperational(stationId);
    void qc.invalidateQueries({ queryKey: queryKeys.customerLedger(customerId) });
    void qc.invalidateQueries({ queryKey: queryKeys.customerStatements(customerId) });
    void qc.invalidateQueries({ queryKey: queryKeys.customerReceivable(stationId, customerId) });
    void qc.invalidateQueries({ queryKey: queryKeys.receivables(stationId) });
  };

  const mutation = useMutation({
    mutationFn: ({ form }: { form: CollectionForm }) => {
      key.current ??= createIdempotencyKey();
      return service.recordCollection(collectionRequest(stationId, customerId, form), {
        idempotencyKey: key.current,
      });
    },
    onSuccess: (_saved, { form }) => {
      key.current = null;
      setUnknownAttempt(null);
      qc.setQueriesData<Array<{ id: string; currentBalance?: unknown }>>(
        { queryKey: ['customers'] },
        (list) => applyCollectionToCustomers(list, customerId, Number(form.amount.trim())),
      );
      refreshBalances();
    },
    onError: (error, { form }) => {
      if (keepsIdempotencyKey(error)) {
        setUnknownAttempt(form);
        return;
      }
      key.current = null;
      setUnknownAttempt(null);
      if (isEarlierAttemptReceived(error)) refreshBalances();
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

  return { save, isSaving: mutation.isPending, unknownAttempt };
}
