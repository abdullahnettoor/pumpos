import type { Station } from '@pump/shared';

/** Replace the cached Station with the accepted response without creating a list. */
export function withSavedStation(
  list: Station[] | undefined,
  saved: Station,
): Station[] | undefined {
  if (!list || !list.some((station) => station.id === saved.id)) return list;
  return list.map((station) => (station.id === saved.id ? saved : station));
}
