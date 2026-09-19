import { err, limitReachedError, ok } from '../../kernel/index.js';
import type { Result } from '../../kernel/index.js';
import type { OrganizationAccessInputs } from './ports.js';
import { resolveEffectiveLimit } from './resolve-access.js';
import { PRODUCT_ACCESS_REGISTRY, type AccessRegistry } from './registry.js';

/**
 * Station capacity enforcement (`station_count`).
 *
 * Capacity must be resolved under a lock on the Organization: two onboarding
 * requests that each read "0 of 1 used" would otherwise both provision. The
 * adapter locks the Organization row; this function then counts and decides,
 * inside the same transaction as the provisioning it guards.
 */
export interface StationCapacityPort {
  /** Serialize capacity decisions for one Organization (SELECT … FOR UPDATE). */
  lockOrganization(organizationId: string): Promise<void>;
  load(organizationId: string): Promise<OrganizationAccessInputs>;
}

export interface StationCapacity {
  value: number;
  used: number;
}

/**
 * Confirm the Organization may add one more Station, or refuse with the
 * detail the UI needs to explain what to do next.
 *
 * Every Station row consumes capacity, including inactive and partially
 * onboarded ones: deactivating a Station does not free a slot.
 */
export async function ensureStationCapacity(
  port: StationCapacityPort,
  organizationId: string,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): Promise<Result<StationCapacity>> {
  await port.lockOrganization(organizationId);
  const inputs = await port.load(organizationId);
  const value = resolveEffectiveLimit('station_count', inputs, registry);
  const used = inputs.usage.station_count ?? 0;

  if (used >= value) {
    return err(
      limitReachedError(
        value === 1
          ? 'This plan includes one Station. Contact PumpOS to add another.'
          : `This plan includes ${value} Stations, and ${used} are in use. Contact PumpOS to add another.`,
        {
          limit: 'station_count',
          value,
          used,
          resolution: 'CONTACT_PUMPOS',
          actionLabel: 'Contact PumpOS',
        },
      ),
    );
  }

  return ok({ value, used });
}
