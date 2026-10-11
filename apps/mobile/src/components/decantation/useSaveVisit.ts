import { useRef, useState } from 'react';
import {
  keepsIdempotencyKey,
  keyForBody,
  newSaveKey,
  resetSaveKey,
  useRecordDecantation,
  useToast,
} from '@pump/ui';
import type { Visit } from '../../lib/decantation/useVisit.js';
import { useBack } from '../../ui/backStack.js';

/**
 * Save one half of the visit. The whole visit goes every time (the update is a
 * full replace). The Idempotency-Key survives an unknown outcome so a retry
 * cannot record the visit twice, and is renewed once the server answered or
 * the form changed since the failed attempt.
 */
export function useSaveVisit(visit: Visit, stationId: string, decantationId?: string) {
  const toast = useToast();
  const back = useBack();
  const record = useRecordDecantation(stationId);
  const keyRef = useRef(newSaveKey());
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const save = async (draft: boolean) => {
    setSubmitted(true);
    if (record.isPending) return;
    if (!(await visit.validate())) return;
    try {
      setError(null);
      const body = visit.body(draft);
      const result = await record.mutateAsync({
        body,
        ...(decantationId ? { decantationId } : {}),
        idempotencyKey: keyForBody(keyRef.current, body),
      });
      resetSaveKey(keyRef.current);
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
      if (!keepsIdempotencyKey(e)) resetSaveKey(keyRef.current);
      setError((e as { message?: string } | null)?.message || 'Could not save the Decantation');
    }
  };

  return { save, error, submitted, saving: record.isPending };
}
