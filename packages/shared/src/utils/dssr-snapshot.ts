/**
 * Reading a DSSR payload: the open day's live preview (`{ snapshotData }`) or a
 * closed day's frozen snapshot. Pure, and free of any figure logic so both the
 * sales headline and the range KPIs can build on it without importing each other.
 */

export type Snapshot = Record<string, any>;

/** The payload of a preview (`{ snapshotData }`), a bare snapshot, or nothing. */
export function readSnapshot(data: unknown): Snapshot {
  const d = data as Snapshot | null | undefined;
  return (d?.snapshotData ?? d ?? {}) as Snapshot;
}
