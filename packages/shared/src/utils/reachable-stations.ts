import { isAuthorizedForStation, type UserContext } from '../permissions/guards.js';

/**
 * Stations a user can reach. Owner: all of the organization's stations (the
 * input list is already organization-scoped). Other roles: only the stations
 * they are authorized for, the same rule `GET /setup/stations` applies.
 */
export function reachableStations<T extends { id: string }>(
  user: UserContext,
  stations: readonly T[],
): T[] {
  return stations.filter((s) =>
    isAuthorizedForStation(user, { organizationId: '', stationId: s.id }),
  );
}

/** The top-bar station breadcrumb is a dropdown only when more than one is reachable. */
export function showStationDropdown(reachable: readonly unknown[]): boolean {
  return reachable.length > 1;
}
