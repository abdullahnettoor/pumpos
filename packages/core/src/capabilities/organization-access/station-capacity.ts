import { stationLimitMessage } from '@pump/shared';
import type { Result } from '../../kernel/index.js';
import { ensureCapacity, type Capacity, type CapacityPort } from './capacity.js';
import { PRODUCT_ACCESS_REGISTRY, type AccessRegistry } from './registry.js';

/** Station capacity enforcement (`station_count`); see `ensureCapacity`. */
export type StationCapacityPort = CapacityPort;
export type StationCapacity = Capacity;

/**
 * Confirm the Organization may add one more Station, or refuse with the
 * detail the UI needs to explain what to do next.
 *
 * Every Station row consumes capacity, including inactive and partially
 * onboarded ones: deactivating a Station does not free a slot.
 */
export function ensureStationCapacity(
  port: StationCapacityPort,
  organizationId: string,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): Promise<Result<StationCapacity>> {
  return ensureCapacity(port, organizationId, 'station_count', stationLimitMessage, registry);
}
