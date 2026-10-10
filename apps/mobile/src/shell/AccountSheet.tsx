import React from 'react';
import { useAccess, useOrganization, useShiftStatus, useUsers } from '@pump/ui';
import type { Station } from '@pump/shared';
import { AppearanceControl } from '../theme/index.js';
import { BottomSheet } from '../ui/BottomSheet.js';
import { ListGroup, ListRow } from '../ui/ListRow.js';
import { SectionLabel } from '../ui/SectionLabel.js';
import { BuildingIcon, CheckIcon, SignOutIcon } from './icons.js';
import { initialsOf } from './context.js';

interface Props {
  open: boolean;
  onClose: () => void;
  userName: string;
  role: string;
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  onSignOut: () => void;
}

const PLAN_LABEL: Record<string, string> = { CORE: 'Core' };
const AVATARS_SHOWN = 4;

const Avatar: React.FC<{ name?: string; text?: string; overlap?: boolean }> = ({
  name = '',
  text,
  overlap,
}) => (
  <span
    className={`grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full border-2 border-card bg-accent-soft text-[11px] font-extrabold text-accent ${overlap ? '-ml-2' : ''}`}
  >
    {text ?? initialsOf(name)}
  </span>
);

/** Read-only team summary: member count and who is on the open shift here. */
const TeamSummary: React.FC<{ stationId: string | null }> = ({ stationId }) => {
  const usersQ = useUsers();
  const statusQ = useShiftStatus(stationId);
  const members: any[] = (usersQ.data || []).filter((u: any) => u.status !== 'INACTIVE');
  const onShift = [
    ...new Set<string>(
      ((statusQ.data?.activeShift?.staffAssignments || []) as any[])
        .map((a) => a.userName as string)
        .filter(Boolean),
    ),
  ];
  const shown = members.slice(0, AVATARS_SHOWN);
  const extra = members.length - shown.length;
  const count = `${members.length} member${members.length === 1 ? '' : 's'}`;

  return (
    <>
      <SectionLabel right={usersQ.isLoading ? undefined : count}>Team</SectionLabel>
      <ListGroup>
        <ListRow
          leading={
            <span className="flex">
              {shown.map((u, i) => (
                <Avatar key={u.id} name={u.fullName ?? ''} overlap={i > 0} />
              ))}
              {extra > 0 && <Avatar text={`+${extra}`} overlap />}
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
}) => {
  // Mounted only while the sheet is open, so these fetch on open.
  const orgQ = useOrganization();
  const accessQ = useAccess();
  const orgName: string | undefined = orgQ.data?.name;
  const plan = accessQ.data?.plan;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-1.5">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-extrabold text-accent">
          {initialsOf(userName)}
        </span>
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

      <TeamSummary stationId={selectedStationId} />

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

/**
 * Bottom sheet behind the station name and avatar: who is signed in, the
 * station switcher, a read-only team summary, the Organization and Sign out.
 * The Appearance row is mounted but renders nothing until it ships (theme/config.ts).
 */
export const AccountSheet: React.FC<Props> = ({ open, onClose, ...body }) => (
  <BottomSheet open={open} onClose={onClose} label="Account">
    <SheetBody onClose={onClose} {...body} />
  </BottomSheet>
);
