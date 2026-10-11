import React, { useState } from 'react';
import { isInactive, loginIdentity, memberStatus, stationSummary } from '../../lib/team/members.js';
import { assignableStations, memberRights, teamWriteReason } from '../../lib/team/permissions.js';
import { Avatar } from '../../ui/Avatar.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { ListGroup } from '../../ui/ListRow.js';
import { Note } from '../../ui/Note.js';
import { SectionLabel } from '../../ui/SectionLabel.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { EditMemberSheet, ResetPasswordSheet, StatusSheet } from './MemberSheets.js';
import { useTeamData } from './useTeamData.js';
import { PausedReason, usePausedAction } from '../../ui/PausedAction.js';

const Detail: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4 px-3 py-[11px]">
    <dt className="flex-shrink-0 text-[12.5px] text-text-muted">{label}</dt>
    <dd className="m-0 min-w-0 truncate text-right text-[13px] font-semibold text-text-high">
      {value}
    </dd>
  </div>
);

/**
 * Member page: who they are and the actions the signed-in user may take:
 * edit, reset password, deactivate / reactivate. Read from the live users list
 * (the pushed element only carries the id), so a save repaints it at once.
 */
export const MemberPage: React.FC<{ memberId: string }> = ({ memberId }) => {
  const { actor, members, stations, onShift, writeAccess, isLoading } = useTeamData();
  const member = members.find((m) => m.id === memberId);
  const gate = usePausedAction(teamWriteReason(writeAccess));
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  // What the status sheet will do is fixed when it opens: the list repaints the
  // moment the save lands, and the sheet must not flip its own wording mid-close.
  const [status, setStatus] = useState<{ open: boolean; activate: boolean }>({
    open: false,
    activate: false,
  });

  if (!member)
    return (
      <DetailPage title="Team member">
        <Note>{isLoading ? 'Loading…' : 'This member is no longer on the team.'}</Note>
      </DetailPage>
    );

  const rights = memberRights(actor, member);
  const badge = memberStatus(member, onShift);
  const inactive = isInactive(member);
  const login = loginIdentity(member);
  const anyAction = rights.canEdit || rights.canResetPassword || rights.canChangeStatus;

  const actionClass =
    'flex min-h-[46px] w-full items-center px-3 text-left text-[13.5px] font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

  return (
    <DetailPage
      title="Team member"
      right={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
    >
      <div className="flex items-center gap-3 px-4 pb-1 pt-1">
        <Avatar name={member.fullName} size="lg" />
        <div className="min-w-0">
          <p className="m-0 truncate text-[15px] font-bold text-text-high">{member.fullName}</p>
          <p className="m-0 truncate text-[11.5px] text-text-muted">
            {member.role} · {stationSummary(member, stations)}
          </p>
        </div>
      </div>

      <SectionLabel>Details</SectionLabel>
      <ListGroup>
        <dl className="m-0 [&>*+*]:border-t [&>*+*]:border-line">
          <Detail label="Role" value={member.role} />
          <Detail label="Stations" value={stationSummary(member, stations)} />
          <Detail label="Phone" value={member.phone || '—'} />
          <Detail label="Email" value={member.email || '—'} />
          <Detail label="App sign-in" value={member.hasLogin ? (login ?? 'Enabled') : 'No login'} />
          <Detail label="Status" value={inactive ? 'Inactive' : 'Active'} />
        </dl>
      </ListGroup>

      {anyAction ? (
        <>
          <SectionLabel>Manage</SectionLabel>
          <ListGroup>
            {rights.canEdit && (
              <button
                type="button"
                {...gate.buttonProps(() => setEditing(true))}
                className={`${actionClass} text-text-high`}
              >
                Edit details
              </button>
            )}
            {rights.canResetPassword && (
              <button
                type="button"
                {...gate.buttonProps(() => setResetting(true))}
                className={`${actionClass} text-text-high`}
              >
                Reset password
              </button>
            )}
            {rights.canChangeStatus && (
              <button
                type="button"
                {...gate.buttonProps(() => setStatus({ open: true, activate: inactive }))}
                className={`${actionClass} ${inactive ? 'text-accent' : 'text-bad-fg'}`}
              >
                {inactive ? 'Reactivate member' : 'Deactivate member'}
              </button>
            )}
          </ListGroup>
          {gate.reason && (
            <div className="mt-2">
              <PausedReason id={gate.reasonId} className="px-1 text-center text-[11.5px]">
                {gate.reason}
              </PausedReason>
            </div>
          )}
        </>
      ) : (
        rights.reason && (
          <p className="m-0 px-4 pt-4 text-[12px] text-text-muted">{rights.reason}</p>
        )
      )}

      {rights.canEdit && (
        <EditMemberSheet
          open={editing}
          onClose={() => setEditing(false)}
          member={member}
          actor={actor}
          stations={assignableStations(actor, stations)}
          roleLocked={rights.roleLocked}
        />
      )}
      {rights.canResetPassword && (
        <ResetPasswordSheet open={resetting} onClose={() => setResetting(false)} member={member} />
      )}
      {rights.canChangeStatus && (
        <StatusSheet
          open={status.open}
          onClose={() => setStatus((s) => ({ ...s, open: false }))}
          member={member}
          active={status.activate}
        />
      )}
    </DetailPage>
  );
};
