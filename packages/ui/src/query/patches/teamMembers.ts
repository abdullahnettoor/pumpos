/**
 * Patch for the team list (`queryKeys.users()`) from an app-access grant's own
 * answer (POST /setup/users/:id/app-access → the member row as GET /setup/users
 * returns it).
 *
 * Only what a grant changes is written: the member now has a login, and the
 * identity it was given is saved onto the member's contact details.
 */

/** The fields of the grant's answer this patch reads. */
export interface AnsweredAppAccess {
  id: string;
  email?: string | null;
  phone?: string | null;
}

interface TeamListMember {
  id: string;
  email?: string | null;
  phone?: string | null;
  hasLogin?: boolean;
}

/**
 * The list with the answered member marked as having a login. Unchanged (the
 * same array) when the member is not cached, or already reads as the answer
 * says, so nothing re-renders; an uncached member comes with the refetch.
 */
export function withAppAccessGranted<T extends TeamListMember>(
  list: T[],
  answer: AnsweredAppAccess,
): T[] {
  const at = list.findIndex((m) => m.id === answer.id);
  if (at < 0) return list;
  const current = list[at];
  const email = answer.email === undefined ? current.email : answer.email;
  const phone = answer.phone === undefined ? current.phone : answer.phone;
  if (current.hasLogin === true && current.email === email && current.phone === phone) return list;
  const next = [...list];
  next[at] = { ...current, email, phone, hasLogin: true };
  return next;
}
