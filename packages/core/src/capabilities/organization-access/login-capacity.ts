import { loginLimitMessage } from '@pump/shared';
import { ok } from '../../kernel/index.js';
import type { Result } from '../../kernel/index.js';
import { ensureCapacity, type Capacity, type CapacityPort } from './capacity.js';
import { PRODUCT_ACCESS_REGISTRY, type AccessRegistry } from './registry.js';

/**
 * Login capacity enforcement (`login_count`, #648).
 *
 * A login is an active user with a login account (Attendants with phone
 * access included). Every path that creates one — adding a member with app
 * access, reactivating a deactivated member who has a login — takes a seat
 * here, under the same Organization lock as Station capacity. Lowering the
 * Limit never disables existing users; it only refuses a new seat.
 */
export type LoginCapacityPort = CapacityPort;
export type LoginCapacity = Capacity;

export function ensureLoginCapacity(
  port: LoginCapacityPort,
  organizationId: string,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): Promise<Result<LoginCapacity>> {
  return ensureCapacity(port, organizationId, 'login_count', loginLimitMessage, registry);
}

export interface LoginHolder {
  status: string;
  authUserId: string | null;
}

/**
 * Take a login seat for a member being set ACTIVE, when that transition
 * consumes one. The Organization lock is taken BEFORE the member is read, so
 * a concurrent reactivation cannot leave this one deciding on a stale status.
 * Returns the locked read (null when the member is gone).
 */
export async function claimLoginSeatForActivation(
  port: LoginCapacityPort,
  organizationId: string,
  readTarget: () => Promise<LoginHolder | null>,
  activating: boolean,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): Promise<Result<LoginHolder | null>> {
  await port.lockOrganization(organizationId);
  const target = await readTarget();
  if (activating && target && target.status !== 'ACTIVE' && target.authUserId !== null) {
    const capacity = await ensureLoginCapacity(port, organizationId, registry);
    if (!capacity.success) return capacity;
  }
  return ok(target);
}
