import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CloudTransactionService, createIdempotencyKey } from '@pump/ui';
import {
  creditLimitFailure,
  reusesIdempotencyKey,
  type CreditLimitFailure,
} from '../../lib/money/creditLimit.js';

const service = new CloudTransactionService();

export type SaveLimitResult = { ok: true } | { ok: false; failure: CreditLimitFailure };

/**
 * Saves one Customer's credit limit through the existing customer update route
 * (`PUT /transactions/customers/:id`, which updates only the fields sent).
 *
 * Caches (pump-data-caching): the customers list is semi tier, so a save writes
 * the new limit into every cached list at once (the limit bar and Over / Near
 * limit state repaint in the same frame) and then invalidates `customers` so the
 * server's row wins. A refusal by the access mode refreshes the Access Document
 * on its own (the app's QueryClient does that for every policy refusal), so the
 * action greys out for real. The receivables summary (#398) reads the
 * same customer rows; when it gets its own key, invalidate it here.
 *
 * Idempotency: one key per logical save. It is reused when the outcome is
 * unknown (network, 5xx) so a retry cannot apply twice, and replaced after a
 * decided refusal, which the API caches under the key.
 */
export function useCreditLimitEdit(customerId: string) {
  const qc = useQueryClient();
  const attempt = useRef<{ limit: number | null; key: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (limit: number | null) => {
      if (attempt.current?.limit !== limit)
        attempt.current = { limit, key: createIdempotencyKey() };
      return service.updateCustomer(
        customerId,
        { creditLimit: limit },
        { idempotencyKey: attempt.current.key },
      );
    },
    onSuccess: (updated, limit) => {
      attempt.current = null;
      const saved = updated?.creditLimit ?? (limit === null ? null : String(limit));
      qc.setQueriesData<Array<{ id: string; creditLimit?: unknown }>>(
        { queryKey: ['customers'] },
        (list) =>
          Array.isArray(list)
            ? list.map((c) => (c.id === customerId ? { ...c, creditLimit: saved } : c))
            : list,
      );
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error) => {
      if (!reusesIdempotencyKey(error)) attempt.current = null;
    },
  });

  const save = async (limit: number | null): Promise<SaveLimitResult> => {
    try {
      await mutation.mutateAsync(limit);
      return { ok: true };
    } catch (error) {
      return { ok: false, failure: creditLimitFailure(error) };
    }
  };

  return { save, isSaving: mutation.isPending };
}
