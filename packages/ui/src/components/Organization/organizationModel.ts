import {
  businessDateSettings,
  resolveEntryDate,
  shiftBusinessDate,
  isUnlimitedLimit,
  stationLimitMessage,
  stationState,
  type PumpState,
  type Role,
  type StationStatusState,
} from '@pump/shared';
import { formatClockInZone, formatHHMM, formatShortDay } from '../../utils/format.js';

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
  settings?: {
    fuel_brand?: string | null;
    timezone?: string | null;
    business_day_starts_at?: string | null;
  } | null;
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

type AccessLike =
  | {
      plan?: string | null;
      limits?: { station_count?: { used: number; value: number; reached: boolean } };
    }
  | null
  | undefined;

/**
 * Plan usage as the one line in the Stations header (#605, owner 15 Oct):
 * "2 of 3 stations on your plan". Only for a Role the server sent the plan to,
 * and only when the plan allows more than one Station: a one-station plan
 * shows nothing, and the "no limit" sentinel is never a number on screen
 * (#603). The API enforces the Limit whatever is rendered.
 */
export function stationPlanLine(access: AccessLike): string | null {
  const limit = access?.limits?.station_count;
  if (!access?.plan || !limit) return null;
  if (isUnlimitedLimit(limit.value) || limit.value <= 1) return null;
  const line = `${limit.used} of ${limit.value} stations on your plan`;
  return limit.reached ? `${line} · Contact PumpOS to add another` : line;
}

// --- Station cards (#605) ----------------------------------------------------

/** What a station card reads: the cached setup lists and the lite shift status. */
export interface StationFactsInput {
  settings?: { timezone?: string | null; business_day_starts_at?: string | null } | null;
  tanks?: readonly { isActive?: boolean | null }[];
  dispensers?: readonly { isActive?: boolean | null }[];
  /** `/shifts/status?lite=true`: the open shift, or null. */
  openShift?: { templateName?: string | null; openedAt?: string | null } | null;
}

export interface StationFact {
  label: string;
  /** `null` while its list is loading. */
  value: string | null;
}

const activeCount = (rows: readonly { isActive?: boolean | null }[] | undefined) =>
  rows ? rows.filter((r) => r.isActive !== false).length : null;

/**
 * A station card's key facts: tanks, dispensers, timezone, day start and the
 * open shift. Counts are the active ones; a list still loading reads `null`.
 * The shift's opening time reads on the station's clock.
 */
export function stationFacts(input: StationFactsInput): StationFact[] {
  const { timeZone } = businessDateSettings(input.settings);
  const dayStart = input.settings?.business_day_starts_at || '06:00';
  const shift = input.openShift;
  const tanks = activeCount(input.tanks);
  const dispensers = activeCount(input.dispensers);
  return [
    { label: 'Tanks', value: tanks == null ? null : String(tanks) },
    { label: 'Dispensers', value: dispensers == null ? null : String(dispensers) },
    { label: 'Timezone', value: timeZone },
    { label: 'Day start', value: formatHHMM(dayStart) || dayStart },
    {
      label: 'Open shift',
      value:
        shift === undefined
          ? null
          : shift === null
            ? 'None'
            : [
                shift.templateName || 'Shift',
                shift.openedAt ? `since ${formatClockInZone(shift.openedAt, timeZone)}` : '',
              ]
                .filter(Boolean)
                .join(', '),
    },
  ];
}

/**
 * Whether "Onboard station" may be offered. Absent access data means not yet
 * (pump-access-gating): until the Access Document has loaded the button is
 * disabled, then it is refused only at the Limit. The API enforces the Limit
 * whatever is rendered.
 */
export function onboardGate(access: AccessLike): {
  disabled: boolean;
  title?: string;
} {
  if (!access) return { disabled: true, title: "Checking your plan's station limit…" };
  const limit = access.limits?.station_count;
  if (limit?.reached) return { disabled: true, title: stationLimitMessage(limit.value) };
  return { disabled: false };
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
 * The one timezone the feed reads in: the active Station's, else the shared
 * default (Asia/Kolkata, as `businessDateSettings`). Day groups and row times
 * both take this value, so they never disagree, and neither reads the browser.
 */
export const activityTimeZone = (station: { settings?: unknown } | null | undefined): string =>
  businessDateSettings(station?.settings).timeZone;

/**
 * The feed in day groups, newest first as it arrives, each headed by a readable
 * day. Days are the active Station's calendar (`resolveEntryDate`: plain
 * midnight in its timezone, no Day Start), never the browser's.
 */
export function groupActivityByDay<T>(
  items: readonly T[],
  recordedAt: (item: T) => string,
  opts: { timeZone: string; now?: Date },
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
