import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './hooks.js';
import { patchQueriesData } from './patches/applyPatch.js';
import { withAppAccessGranted, type AnsweredAppAccess } from './patches/teamMembers.js';

/**
 * A member given app access (#462), written into every cached team list from
 * the write's answer. The caller still invalidates `users` and the access
 * document in the background.
 */
export function patchUsersWithAppAccess(queryClient: QueryClient, answer: AnsweredAppAccess): void {
  patchQueriesData<{ id: string }[]>(queryClient, { queryKey: queryKeys.users() }, (list) =>
    Array.isArray(list) ? withAppAccessGranted(list, answer) : list,
  );
}
