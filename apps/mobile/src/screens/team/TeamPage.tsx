import React, { useState } from 'react';
import { useNav } from '../../shell/nav.js';
import { useShell } from '../../shell/context.js';
import {
  isInactive,
  memberStatus,
  stationSummary,
  type TeamMember,
} from '../../lib/team/members.js';
import { assignableStations, canManageTeam, teamWriteReason } from '../../lib/team/permissions.js';
import { Avatar } from '../../ui/Avatar.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { ListGroup, ListRow } from '../../ui/ListRow.js';
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { MemberPage } from './MemberPage.js';
import { AddMemberSheet } from './MemberSheets.js';
import { useTeamData } from './useTeamData.js';
import { PausedReason, usePausedAction } from '../../ui/PausedAction.js';

const MemberRow: React.FC<{
  member: TeamMember;
  stations: ReadonlyArray<{ id: string; name: string }>;
  onShift: ReadonlySet<string>;
  you: boolean;
}> = ({ member, stations, onShift, you }) => {
  const nav = useNav();
  const status = memberStatus(member, onShift);
  return (
    <ListRow
      onPress={() => nav.push(<MemberPage memberId={member.id} />, `member:${member.id}`)}
      leading={<Avatar name={member.fullName} />}
      title={you ? `${member.fullName} (you)` : member.fullName}
      meta={`${member.role} · ${stationSummary(member, stations)}`}
      end={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
    />
  );
};

/**
 * Team page: every member with their Role, stations and status (on shift now,
 * inactive, no login). Owners and Managers add members from the bottom bar; a
 * Manager is offered only what they may give (see `lib/team/permissions.ts`).
 */
export const TeamPage: React.FC = () => {
  const { station } = useShell();
  const { actor, members, stations, onShift, writeAccess, isLoading, isError, refetch } =
    useTeamData();
  const [adding, setAdding] = useState(false);
  const gate = usePausedAction(teamWriteReason(writeAccess));

  const active = members.filter((m) => !isInactive(m));
  const inactive = members.filter(isInactive);
  const canAdd = canManageTeam(actor.role);

  const actions = canAdd ? (
    <>
      {gate.reason && (
        <PausedReason id={gate.reasonId} className="px-1 text-center text-[11.5px]">
          {gate.reason}
        </PausedReason>
      )}
      <button
        type="button"
        {...gate.buttonProps(() => setAdding(true))}
        className="flex h-11 items-center justify-center rounded-[13px] bg-accent text-[13.5px] font-bold text-on-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        Add member
      </button>
    </>
  ) : undefined;

  return (
    <DetailPage
      title="Team"
      subtitle={
        isLoading ? undefined : `${active.length} active member${active.length === 1 ? '' : 's'}`
      }
      actions={actions}
    >
      {isLoading ? (
        <Note>Loading the team…</Note>
      ) : isError ? (
        <div className="px-4 py-8 text-center">
          <p role="alert" className="m-0 text-[13px] text-bad-fg">
            Could not load the team.
          </p>
          <button
            type="button"
            onClick={refetch}
            className="mt-2 rounded-lg px-3 py-2 text-[13px] font-bold text-accent"
          >
            Try again
          </button>
        </div>
      ) : members.length === 0 ? (
        <Note>No team members yet.</Note>
      ) : (
        <>
          <SectionLabel right={String(active.length)}>Active</SectionLabel>
          <ListGroup>
            {active.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                stations={stations}
                onShift={onShift}
                you={m.id === actor.userId}
              />
            ))}
          </ListGroup>
          {inactive.length > 0 && (
            <>
              <SectionLabel right={String(inactive.length)}>Inactive</SectionLabel>
              <ListGroup>
                {inactive.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    stations={stations}
                    onShift={onShift}
                    you={m.id === actor.userId}
                  />
                ))}
              </ListGroup>
            </>
          )}
        </>
      )}
      {canAdd && (
        <AddMemberSheet
          open={adding}
          onClose={() => setAdding(false)}
          actor={actor}
          stations={assignableStations(actor, stations)}
          currentStationId={station?.id}
        />
      )}
    </DetailPage>
  );
};
