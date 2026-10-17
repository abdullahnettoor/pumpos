import { isUnlimitedLimit } from '@pump/shared';
import { err, limitReachedError, ok } from '../../kernel/index.js';
import type { Result } from '../../kernel/index.js';
import type { OrganizationAccessInputs } from './ports.js';
import { resolveEffectiveLimit } from './resolve-access.js';
import type { AccessRegistry } from './registry.js';

/**
 * Capacity must be resolved under a lock on the Organization: two requests
 * that each read "0 of 1 used" would otherwise both proceed. The adapter locks
 * the Organization row; the check then counts and decides, inside the same
 * transaction as the write it guards.
 */
export interface CapacityPort {
  /** Serialize capacity decisions for one Organization (SELECT … FOR UPDATE). */
  lockOrganization(organizationId: string): Promise<void>;
  load(organizationId: string): Promise<OrganizationAccessInputs>;
}

export interface Capacity {
  value: number;
  used: number;
}

/** Lock → resolve the Limit → compare usage → refuse with LIMIT_REACHED detail. */
export async function ensureCapacity(
  port: CapacityPort,
  organizationId: string,
  limit: 'station_count' | 'login_count',
  refusalMessage: (value: number) => string,
  registry: AccessRegistry,
): Promise<Result<Capacity>> {
  await port.lockOrganization(organizationId);
  const inputs = await port.load(organizationId);
  const value = resolveEffectiveLimit(limit, inputs, registry);
  const used = inputs.usage[limit] ?? 0;

  // The "no limit" sentinel (a demo Organization, #603) never refuses.
  if (!isUnlimitedLimit(value) && used >= value) {
    return err(
      limitReachedError(refusalMessage(value), {
        limit,
        value,
        used,
        resolution: 'CONTACT_PUMPOS',
        actionLabel: 'Contact PumpOS',
      }),
    );
  }
  return ok({ value, used });
}
