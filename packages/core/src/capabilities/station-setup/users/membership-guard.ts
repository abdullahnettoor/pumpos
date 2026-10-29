import { conflictError, err, forbiddenError, ok } from '../../../kernel/index.js';
import type { Result } from '../../../kernel/index.js';
import type { Role } from '@pump/shared';

export interface MembershipChange {
  actorUserId: string;
  target: { id: string; role: Role; status: string };
  /** The Role the member would end up with, when the change sets one. */
  role?: Role;
  /** The status the member would end up with, when the change sets one. */
  status?: string;
  /** Other active Owners in the Organization, excluding the target. */
  otherActiveOwners: number;
}

/**
 * Refuses a member changing their own standing, and any change that would
 * leave the Organization without an active Owner (last-Owner lockout, #443).
 */
export function checkMembershipChange(change: MembershipChange): Result<void> {
  const { actorUserId, target, role, status, otherActiveOwners } = change;
  const deactivating = status !== undefined && status !== 'ACTIVE';
  const demoting = role !== undefined && role !== target.role;
  if (actorUserId === target.id) {
    if (deactivating && target.status === 'ACTIVE') {
      return err(forbiddenError("You can't deactivate your own account."));
    }
    if (demoting) return err(forbiddenError("You can't change your own Role."));
  }
  const removesOwner =
    target.role === 'Owner' && target.status === 'ACTIVE' && (deactivating || demoting);
  if (removesOwner && otherActiveOwners === 0) {
    return err(conflictError('An Organization needs at least one active Owner.'));
  }
  return ok(undefined);
}

export function checkSelfPasswordReset(actorUserId: string, targetId: string): Result<void> {
  return actorUserId === targetId
    ? err(forbiddenError("You can't reset your own password here."))
    : ok(undefined);
}
