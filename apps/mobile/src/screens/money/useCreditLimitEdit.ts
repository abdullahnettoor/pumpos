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
 * (`PUT /transactions/customers/:id`, which updates only the fields sent). The
 * optional `note` is the reason for the change; the server records it on the
 * customer-updated event, not on the Customer.
 *
 * Caches (pump-data-caching): the customers list is semi tier, so a save writes
 * the new limit into every cached list at once (the limit bar and Over / Near
 * limit state repaint in the same frame) and then invalidates `customers` so the
 * server's row wins. A refusal by the access mode refreshes the Access Document
 * on its own (the app's QueryClient does that for every policy refusal), so the
 * action greys out for real.
 *
 * TODO(#398): the receivables summary has its own query key once #398 lands on
 * the base (`receivables`, `customer-receivable`); invalidate them here too,
 * since the limit feeds the same rows. They do not exist on this base yet.
 *
 * Idempotency: one key per logical save. It is reused when the outcome is
 * unknown (network, 5xx) so a retry cannot apply twice, and replaced after a
 * decided refusal, which the API caches under the key.
 */
export function useCreditLimitEdit(customerId: string) {
  const qc = useQueryClient();
  const attempt = useRef<{ limit: number | null; note?: string; key: string } | null>(null);

  const mutation = useMutation({
    mutationFn: ({ limit, note }: { limit: number | null; note?: string }) => {
      if (attempt.current?.limit !== limit || attempt.current?.note !== note)
        attempt.current = { limit, note, key: createIdempotencyKey() };
      return service.updateCustomer(
        customerId,
        { creditLimit: limit, ...(note ? { note } : {}) },
        { idempotencyKey: attempt.current.key },
      );
    },
    onSuccess: (updated, { limit }) => {
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

  const save = async (limit: number | null, note?: string): Promise<SaveLimitResult> => {
    try {
      await mutation.mutateAsync({ limit, note });
      return { ok: true };
    } catch (error) {
      return { ok: false, failure: creditLimitFailure(error) };
    }
  };

  return { save, isSaving: mutation.isPending };
}
