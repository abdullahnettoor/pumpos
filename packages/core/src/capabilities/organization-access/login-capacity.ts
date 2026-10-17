import { isUnlimitedLimit, loginLimitMessage } from '@pump/shared';
import { err, limitReachedError, ok } from '../../kernel/index.js';
import type { Result } from '../../kernel/index.js';
import { resolveEffectiveLimit } from './resolve-access.js';
import { PRODUCT_ACCESS_REGISTRY, type AccessRegistry } from './registry.js';
import type { StationCapacity, StationCapacityPort } from './station-capacity.js';

/**
 * Login capacity enforcement (`login_count`, #648).
 *
 * A login is an active user with a login account (Attendants with phone
 * access included). Every path that creates one — adding a member with app
 * access, reactivating a deactivated member who has a login — takes a seat
 * here, under the same Organization lock as Station capacity. Lowering the
 * Limit never disables existing users; it only refuses a new seat.
 */
export type LoginCapacityPort = StationCapacityPort;
export type LoginCapacity = StationCapacity;

export async function ensureLoginCapacity(
  port: LoginCapacityPort,
  organizationId: string,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): Promise<Result<LoginCapacity>> {
  await port.lockOrganization(organizationId);
  const inputs = await port.load(organizationId);
  const value = resolveEffectiveLimit('login_count', inputs, registry);
  const used = inputs.usage.login_count ?? 0;

  if (!isUnlimitedLimit(value) && used >= value) {
    return err(
      limitReachedError(loginLimitMessage(value), {
        limit: 'login_count',
        value,
        used,
        resolution: 'CONTACT_PUMPOS',
        actionLabel: 'Contact PumpOS',
      }),
    );
  }
  return ok({ value, used });
}
