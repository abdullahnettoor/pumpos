import { useMemo } from 'react';
import { useAccess, useShiftStatus, useStations, useUsers } from '@pump/ui';
import type { Station } from '@pump/shared';
import { onShiftIds, sortMembers, type TeamMember } from '../../lib/team/members.js';
import { teamWriteAccess, type TeamActor } from '../../lib/team/permissions.js';
import { useShell } from '../../shell/context.js';

/**
 * The only place the Team screens read their queries. The users and stations
 * lists are static tier (`TIER.static`, persisted); who is on shift comes from
 * the same full shift status the Account sheet and Shifts read, so it is one
 * cached request. Roles and stations are the shell's.
 */
export function useTeamData() {
  const { station, role, userId } = useShell();
  const usersQ = useUsers();
  const stationsQ = useStations();
  const statusQ = useShiftStatus(station?.id ?? null);
  const accessMode = useAccess().data?.subscription?.mode;

  const stations = useMemo<Station[]>(() => (stationsQ.data ?? []) as Station[], [stationsQ.data]);
  const members = useMemo(() => sortMembers((usersQ.data ?? []) as TeamMember[]), [usersQ.data]);
  const onShift = useMemo(
    () => onShiftIds(statusQ.data?.activeShift?.staffAssignments),
    [statusQ.data],
  );
  // The stations list is already limited to the user's own (a Manager sees only theirs).
  const actor = useMemo<TeamActor>(
    () => ({ role, userId, stationIds: stations.map((s) => s.id) }),
    [role, userId, stations],
  );

  return {
    actor,
    members,
    stations,
    onShift,
    writeAccess: teamWriteAccess(accessMode),
    isLoading: usersQ.isLoading,
    isError: usersQ.isError,
    refetch: () => void usersQ.refetch(),
  };
}
