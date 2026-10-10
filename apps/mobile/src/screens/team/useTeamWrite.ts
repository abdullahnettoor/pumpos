import { useCallback, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { CloudUserAssignmentService, createIdempotencyKey, queryKeys } from '@pump/ui';
import { addMember, memberRow, patchMember } from '../../lib/team/cache.js';
import { teamFailure, type TeamAction, type TeamFailure } from '../../lib/team/failure.js';
import type { TeamMember } from '../../lib/team/members.js';

const service = new CloudUserAssignmentService();

export type TeamWriteResult<T> = { ok: true; data: T } | { ok: false; failure: TeamFailure };

interface WriteConfig<I, T> {
  action: TeamAction;
  /** The request. `key` is the Idempotency-Key for this logical save. */
  run: (input: I, key: string) => Promise<T>;
  /** Repaint the cached team list with what was saved (the key is invalidated after). */
  apply?: (qc: QueryClient, saved: T, input: I) => void;
}

const refreshUsers = (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.users() });
const patchUsers = (qc: QueryClient, fn: (list: TeamMember[] | undefined) => unknown) =>
  qc.setQueriesData<TeamMember[]>({ queryKey: queryKeys.users() }, (list) => fn(list) as never);

/**
 * One team write with one Idempotency-Key per logical save.
 *
 * The key is created on the first attempt and kept until the outcome is decided:
 *  - success: the next save is a new action, so a new key;
 *  - a decided refusal (the API caches every 2xx/4xx under the key): a new key;
 *  - an unknown outcome (network drop, 5xx, still in flight): the SAME key, so a
 *    retry cannot add the member twice or apply a change twice;
 *  - the key already holds an earlier attempt with other content: that attempt
 *    reached the server, so the list is refreshed and a new key taken.
 * A second tap while a save is running joins it instead of sending another.
 *
 * Caches (pump-data-caching): the users list is static tier. A save writes the
 * member into every cached list and then invalidates `users`, so the server's
 * row wins. A refusal by access policy refreshes the Access Document on its own
 * (the app's QueryClient does that for every policy refusal).
 *
 * The hook must live in a component that stays mounted while its sheet is
 * closed and reopened, or a retry after a network error would start a new key.
 */
export function useTeamWrite<I, T>({ action, run, apply }: WriteConfig<I, T>) {
  const qc = useQueryClient();
  const key = useRef<string | null>(null);
  const inFlight = useRef<Promise<TeamWriteResult<T>> | null>(null);
  const [isSaving, setSaving] = useState(false);

  const save = useCallback(
    (input: I): Promise<TeamWriteResult<T>> => {
      if (inFlight.current) return inFlight.current;
      key.current ??= createIdempotencyKey();
      setSaving(true);
      const attempt = (async (): Promise<TeamWriteResult<T>> => {
        try {
          const data = await run(input, key.current!);
          key.current = null;
          apply?.(qc, data, input);
          void refreshUsers(qc);
          return { ok: true, data };
        } catch (error) {
          const failure = teamFailure(error, action);
          if (!failure.unknownOutcome) key.current = null;
          if (failure.earlierAttemptReceived) void refreshUsers(qc);
          return { ok: false, failure };
        } finally {
          inFlight.current = null;
          setSaving(false);
        }
      })();
      inFlight.current = attempt;
      return attempt;
    },
    [action, apply, qc, run],
  );

  return { save, isSaving };
}

type Body = Record<string, unknown>;
type Saved = object | undefined;

const runAdd = (body: Body, key: string) => service.createUser(body, { idempotencyKey: key });

const applyAdd = (qc: QueryClient, saved: Saved, body: Body) => {
  // The response is the bare user: add what the list endpoint derives (`hasLogin`, stations).
  const member = {
    ...memberRow(saved),
    hasLogin: Boolean(body.enableAppAccess),
    stationIds: (body.stationIds as string[] | undefined) ?? [],
  } as TeamMember;
  if (member.id) patchUsers(qc, (list) => addMember(list, member));
};

/** Add a member (`POST /setup/users`). `body` comes from `memberRequest`. */
export function useAddMember() {
  return useTeamWrite<Body, Saved>({ action: 'add', run: runAdd, apply: applyAdd });
}

/** Edit a member (`PUT /setup/users/:id`). */
export function useUpdateMember(id: string) {
  const run = useCallback(
    (body: Body, key: string) => service.updateUser(id, body, { idempotencyKey: key }),
    [id],
  );
  const apply = useCallback(
    (qc: QueryClient, saved: Saved, body: Body) =>
      patchUsers(qc, (list) =>
        patchMember(list, id, {
          ...memberRow(saved),
          ...(Array.isArray(body.stationIds) ? { stationIds: body.stationIds as string[] } : {}),
        }),
      ),
    [id],
  );
  return useTeamWrite<Body, Saved>({ action: 'update', run, apply });
}

/** Set a new password for a member with a login (`POST /setup/users/:id/reset-password`). */
export function useResetPassword(id: string) {
  const run = useCallback(
    (password: string, key: string) =>
      service.resetUserPassword(id, password, { idempotencyKey: key }),
    [id],
  );
  return useTeamWrite<string, Saved>({ action: 'reset', run });
}

/** Deactivate or reactivate a member (`POST /setup/users/:id/deactivate|reactivate`). */
export function useSetMemberActive(id: string, active: boolean) {
  const run = useCallback(
    (_: void, key: string) =>
      active
        ? service.reactivateUser(id, { idempotencyKey: key })
        : service.deactivateUser(id, { idempotencyKey: key }),
    [id, active],
  );
  const apply = useCallback(
    (qc: QueryClient) =>
      patchUsers(qc, (list) => patchMember(list, id, { status: active ? 'ACTIVE' : 'INACTIVE' })),
    [id, active],
  );
  return useTeamWrite<void, Saved>({ action: 'status', run, apply });
}
