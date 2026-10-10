import React from 'react';
import { initialsOf, useAccess, useOrganization, useShiftStatus, useUsers } from '@pump/ui';
import type { Role, Station } from '@pump/shared';
import { AppearanceControl } from '../theme/index.js';
import { Avatar } from '../ui/Avatar.js';
import { BottomSheet } from '../ui/BottomSheet.js';
import { ListGroup, ListRow } from '../ui/ListRow.js';
import { SectionLabel } from '../ui/SectionLabel.js';
import { BuildingIcon, CheckIcon, SignOutIcon } from '../ui/icons.js';
import { useNav } from './nav.js';
import { activeMembers, onShiftNames } from './team.js';

interface Props {
  open: boolean;
  onClose: () => void;
  userName: string;
  role: Role;
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  onSignOut: () => void;
  /** The Team page the Team row opens (App supplies it; the shell does not import screens' pages). */
  teamPage: React.ReactNode;
}

const PLAN_LABEL: Record<string, string> = { CORE: 'Core' };
const AVATARS_SHOWN = 4;

/** Team summary (member count, who is on the open shift here) that opens the Team page. */
const TeamSummary: React.FC<{ stationId: string | null; onOpen: () => void }> = ({
  stationId,
  onOpen,
}) => {
  const usersQ = useUsers();
  const statusQ = useShiftStatus(stationId);
  const members = activeMembers<{ id: string; fullName?: string; status?: string }>(usersQ.data);
  const onShift = onShiftNames(statusQ.data?.activeShift?.staffAssignments);
  const shown = members.slice(0, AVATARS_SHOWN);
  const extra = members.length - shown.length;
  const count = `${members.length} member${members.length === 1 ? '' : 's'}`;

  return (
    <>
      <SectionLabel right={usersQ.isLoading ? undefined : count}>Team</SectionLabel>
      <ListGroup>
        <ListRow
          onPress={onOpen}
          leading={
            <span className="flex">
              {shown.map((u, i) => (
                <Avatar key={u.id} name={u.fullName ?? ''} size="sm" overlap={i > 0} />
              ))}
              {extra > 0 && <Avatar text={`+${extra}`} size="sm" overlap />}
            </span>
          }
          title={onShift.length ? `${onShift.length} on shift now` : 'No one on shift now'}
          meta={onShift.length ? onShift.join(', ') : undefined}
        />
      </ListGroup>
    </>
  );
};

const SheetBody: React.FC<Omit<Props, 'open'>> = ({
  onClose,
  userName,
  role,
  stations,
  selectedStationId,
  onSelectStation,
  onSignOut,
  teamPage,
}) => {
  // Mounted only while the sheet is open, so these fetch on open.
  const orgQ = useOrganization();
  const accessQ = useAccess();
  const nav = useNav();
  const orgName: string | undefined = orgQ.data?.name;
  const plan = accessQ.data?.plan;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-1.5">
        <Avatar name={userName} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-text-high">{userName}</p>
          <p className="truncate text-[11px] text-text-muted">
            {role}
            {orgName ? ` · ${orgName}` : ''}
          </p>
        </div>
      </div>

      <SectionLabel right={String(stations.length)}>Station</SectionLabel>
      <ListGroup>
        {stations.map((s) => {
          const on = s.id === selectedStationId;
          return (
            <ListRow
              key={s.id}
              onPress={() => {
                onSelectStation(s.id);
                onClose();
              }}
              chevron={false}
              leading={
                <span
                  className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] border text-[11px] font-bold ${
                    on
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line bg-card-alt text-text-muted'
                  }`}
                >
                  {initialsOf(s.name)}
                </span>
              }
              title={s.name}
              meta={s.address || undefined}
              end={
                on ? (
                  <span className="text-good" role="img" aria-label="Current station">
                    <CheckIcon size={18} strokeWidth={2.4} />
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </ListGroup>

      <TeamSummary
        stationId={selectedStationId}
        onOpen={() => {
          onClose();
          nav.push(teamPage, 'team');
        }}
      />

      <div className="px-4 empty:hidden [&:not(:empty)]:pt-4">
        <AppearanceControl />
      </div>

      <ListGroup className="mt-3">
        <ListRow
          leading={
            <span className="text-text-muted">
              <BuildingIcon size={17} />
            </span>
          }
          title={orgName ?? 'Organization'}
          meta={plan ? `Plan · ${PLAN_LABEL[plan] ?? plan}` : undefined}
        />
        <button
          type="button"
          onClick={() => {
            onClose();
            onSignOut();
          }}
          className="flex w-full items-center gap-2.5 px-3 py-[11px] text-bad-fg"
        >
          <SignOutIcon size={17} />
          <span className="text-[13px] font-semibold">Sign out</span>
        </button>
      </ListGroup>
    </div>
  );
};

/** The visible header station button: where focus lands if the one that opened the sheet is gone. */
const stationButton = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-station-button]')).find(
    (el) => !el.closest('[aria-hidden="true"]'),
  ) ?? null;

/**
 * Bottom sheet behind the station name and avatar: who is signed in, the
 * station switcher, the team summary (opens the Team page), the Organization and Sign out.
 * The Appearance row is mounted but renders nothing until it ships (theme/config.ts).
 */
export const AccountSheet: React.FC<Props> = ({ open, onClose, ...body }) => (
  <BottomSheet open={open} onClose={onClose} label="Account" fallbackFocus={stationButton}>
    <SheetBody onClose={onClose} {...body} />
  </BottomSheet>
);
