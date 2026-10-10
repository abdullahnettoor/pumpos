import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKey, useInvalidateOperational } from '@pump/ui';
import {
  applyPaymentToParties,
  isEarlierAttemptReceived,
  keepsIdempotencyKey,
  type OfficePaymentFailure,
  type OfficePaymentFields,
} from '../../lib/money/officePayment.js';

export type OfficePaymentResult = { ok: true } | { ok: false; failure: OfficePaymentFailure };

interface Options<F extends OfficePaymentFields> {
  stationId: string;
  partyId: string;
  /** The cached party list whose balance falls by the amount: customers or suppliers (semi tier). */
  partyListKey: 'customers' | 'suppliers';
  /** The party's own ledger query, refreshed with the balances. */
  ledgerKey: readonly unknown[];
  /** The one request: the existing route, carrying this Idempotency-Key. */
  send: (form: F, idempotencyKey: string) => Promise<unknown>;
  failure: (error: unknown) => OfficePaymentFailure;
}

/**
 * The save behind a Record payment sheet (a Collection or a Supplier Payment):
 * one Office Record request with an Idempotency-Key kept until the outcome is
 * DECIDED.
 *
 * Caches (pump-data-caching): the party lists are semi tier, so a save writes
 * the lower balance into every cached list at once (the card repaints in the
 * same frame) and then `useInvalidateOperational` refreshes the server's rows
 * (customers, suppliers, collections, purchases, account balances, the Daily
 * Cash Book). The party's ledger is invalidated through its own key. A refusal
 * by the access mode refreshes the Access Document on its own (the app's
 * QueryClient does that for every policy refusal).
 *
 * Idempotency: while the outcome is unknown (a double tap, a network drop, a 5xx)
 * the key survives every edit of the form, so a retry, edited or not, cannot
 * record the payment twice: the API answers an edited retry of an attempt it
 * received with a conflict (the balance is then re-read) and treats one it never
 * saw as new. A decided answer (success, or a 4xx the API caches under its key)
 * clears the key. `unknownAttempt` is the entries of the attempt whose outcome
 * is unknown, so the sheet can warn that it may have gone through.
 */
export function useOfficePayment<F extends OfficePaymentFields>(opts: Options<F>) {
  const { stationId, partyId, partyListKey, ledgerKey, send, failure } = opts;
  const qc = useQueryClient();
  const invalidateOperational = useInvalidateOperational();
  const key = useRef<string | null>(null);
  const inFlight = useRef<Promise<OfficePaymentResult> | null>(null);
  const [unknownAttempt, setUnknownAttempt] = useState<F | null>(null);

  const refreshBalances = () => {
    void invalidateOperational(stationId);
    void qc.invalidateQueries({ queryKey: ledgerKey });
  };

  const mutation = useMutation({
    mutationFn: ({ form }: { form: F }) => {
      key.current ??= createIdempotencyKey();
      return send(form, key.current);
    },
    onSuccess: (_saved, { form }) => {
      key.current = null;
      setUnknownAttempt(null);
      qc.setQueriesData<Array<{ id: string; currentBalance?: unknown }>>(
        { queryKey: [partyListKey] },
        (list) => applyPaymentToParties(list, partyId, Number(form.amount.trim())),
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

  const save = (form: F): Promise<OfficePaymentResult> => {
    // A second tap while the first is on its way is the same save, not another one.
    if (inFlight.current) return inFlight.current;
    const run = mutation
      .mutateAsync({ form })
      .then<OfficePaymentResult>(() => ({ ok: true }))
      .catch<OfficePaymentResult>((error) => ({ ok: false, failure: failure(error) }))
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    return run;
  };

  return { save, isSaving: mutation.isPending, unknownAttempt };
}
