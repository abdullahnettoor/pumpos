import {
  resolveEntryDate,
  shiftBusinessDate,
  stationLimitMessage,
  stationState,
  type PumpState,
  type Role,
  type StationStatusState,
} from '@pump/shared';
import { formatShortDay } from '../../utils/format.js';

/**
 * The Organization page's figures and words (#538), as pure functions so the
 * screen only lays them out.
 */

// --- Stations ---------------------------------------------------------------

export interface StationLike {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  onboardingStatus?: string | null;
  settings?: { fuel_brand?: string | null } | null;
}

export type StationFilter = 'all' | 'ready' | 'setup';

export interface StationRow {
  station: StationLike;
  state: StationStatusState;
  /** Address · phone · fuel brand: the line under the name, never the name again. */
  details: string;
  active: boolean;
}

export function buildStationRows(
  stations: readonly StationLike[],
  activeId: string | null | undefined,
): StationRow[] {
  return stations.map((s) => ({
    station: s,
    state: stationState(s.onboardingStatus),
    details: [s.address, s.phone, s.settings?.fuel_brand].filter(Boolean).join(' · '),
    active: s.id === activeId,
  }));
}

export const stationCounts = (rows: readonly StationRow[]): Record<StationFilter, number> => ({
  all: rows.length,
  ready: rows.filter((r) => r.state === 'station-ready').length,
  setup: rows.filter((r) => r.state !== 'station-ready').length,
});

export const filterStations = (rows: readonly StationRow[], filter: StationFilter): StationRow[] =>
  filter === 'all'
    ? [...rows]
    : rows.filter((r) => (filter === 'ready') === (r.state === 'station-ready'));

/**
 * Station usage against the plan's Limit, from the Access Document. Shown only
 * to a Role the server sent the plan to; the API enforces the Limit whatever is
 * rendered.
 */
export interface StationCapacity {
  used: number;
  value: number;
  reached: boolean;
  /** "2 more on this plan", or at the Limit what to do (`stationLimitMessage`). */
  hint: string;
}

export function stationCapacity(
  access:
    | {
        plan?: string | null;
        limits?: { station_count?: { used: number; value: number; reached: boolean } };
      }
    | null
    | undefined,
): StationCapacity | null {
  const limit = access?.limits?.station_count;
  if (!access?.plan || !limit) return null;
  const left = Math.max(0, limit.value - limit.used);
  return {
    used: limit.used,
    value: limit.value,
    reached: limit.reached,
    hint: limit.reached ? stationLimitMessage(limit.value) : `${left} more on this plan`,
  };
}

// --- Team -------------------------------------------------------------------

export interface MemberLike {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role?: Role | string | null;
  status?: string | null;
  hasLogin?: boolean | null;
  stationIds?: string[] | null;
}

export type MemberFilter = 'all' | 'active' | 'inactive' | 'no-login';

/** A member's one status: Inactive first, then No login, else Active. */
export function memberState(u: MemberLike): Extract<PumpState, 'active' | 'inactive' | 'no-login'> {
  if (u.status === 'INACTIVE') return 'inactive';
  if (!u.hasLogin) return 'no-login';
  return 'active';
}

/** What the member signs in with, or null without one. */
export const loginIdentity = (u: MemberLike): string | null => u.email || u.phone || null;

/** The stations a member works at, by name; an Owner reaches every station. */
export function memberStations(u: MemberLike, stations: readonly { id: string; name: string }[]) {
  if (u.role === 'Owner') return 'All stations';
  const names = (u.stationIds ?? []).map(
    (id) => stations.find((s) => s.id === id)?.name ?? 'Unknown station',
  );
  return names.length ? names.join(', ') : 'None';
}

export const memberCounts = (members: readonly MemberLike[]): Record<MemberFilter, number> => {
  const out: Record<MemberFilter, number> = {
    all: members.length,
    active: 0,
    inactive: 0,
    'no-login': 0,
  };
  for (const m of members) out[memberState(m)] += 1;
  return out;
};

export function filterMembers<T extends MemberLike>(
  members: readonly T[],
  filter: MemberFilter,
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  return members.filter(
    (m) =>
      (filter === 'all' || memberState(m) === filter) &&
      (!q || [m.fullName, m.email, m.phone, m.role].some((v) => v && v.toLowerCase().includes(q))),
  );
}

// --- Activity ---------------------------------------------------------------

export interface ActivityDay<T> {
  /** Station calendar date, `YYYY-MM-DD`: a key, never shown. */
  key: string;
  /** "Today", "Yesterday", or "Mon 13 Oct". */
  label: string;
  items: T[];
}

/**
 * The feed in day groups, newest first as it arrives, each headed by a readable
 * day. Days are the active Station's calendar (`resolveEntryDate`: plain
 * midnight in its timezone, no Day Start), never the browser's.
 */
export function groupActivityByDay<T>(
  items: readonly T[],
  recordedAt: (item: T) => string,
  opts: { timeZone?: string | null; now?: Date } = {},
): ActivityDay<T>[] {
  const { timeZone } = opts;
  const today = resolveEntryDate({ now: opts.now, timeZone });
  const yesterday = shiftBusinessDate(today, -1);
  const days: ActivityDay<T>[] = [];
  for (const item of items) {
    const at = new Date(recordedAt(item));
    const key = Number.isNaN(at.getTime()) ? 'unknown' : resolveEntryDate({ now: at, timeZone });
    let day = days.find((d) => d.key === key);
    if (!day) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : key === 'unknown'
              ? 'Undated'
              : formatShortDay(key);
      day = { key, label, items: [] };
      days.push(day);
    }
    day.items.push(item);
  }
  return days;
}
