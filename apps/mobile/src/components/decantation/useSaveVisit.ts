import { useRef, useState } from 'react';
import {
  createIdempotencyKey,
  keepsIdempotencyKey,
  useRecordDecantation,
  useToast,
} from '@pump/ui';
import type { Visit } from '../../lib/decantation/useVisit.js';
import { useBack } from '../../ui/backStack.js';

/**
 * Save one half of the visit. The whole visit goes every time (the update is a
 * full replace). The Idempotency-Key survives an unknown outcome so a retry
 * cannot record the visit twice, and is renewed once the server answered.
 */
export function useSaveVisit(visit: Visit, stationId: string, decantationId?: string) {
  const toast = useToast();
  const back = useBack();
  const record = useRecordDecantation(stationId);
  const keyRef = useRef(createIdempotencyKey());
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const save = async (draft: boolean) => {
    setSubmitted(true);
    if (visit.errors.any || record.isPending) return;
    try {
      setError(null);
      const result = await record.mutateAsync({
        body: visit.body(draft),
        ...(decantationId ? { decantationId } : {}),
        idempotencyKey: keyRef.current,
      });
      keyRef.current = createIdempotencyKey();
      const flagged = (result?.decantation?.flags?.length ?? 0) > 0 || visit.flags.flags.length > 0;
      toast.success(
        draft
          ? 'Tanker arrived. Finish unloading when it is done.'
          : flagged
            ? 'Decantation saved and flagged for review.'
            : 'Decantation saved.',
      );
      back();
    } catch (e) {
      if (!keepsIdempotencyKey(e)) keyRef.current = createIdempotencyKey();
      setError((e as { message?: string } | null)?.message || 'Could not save the Decantation');
    }
  };

  return { save, error, submitted, saving: record.isPending };
}
