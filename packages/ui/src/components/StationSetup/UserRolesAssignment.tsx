import React, { useMemo, useState } from 'react';
import type { Station } from '@pump/shared';
import { useStations, useUsers } from '../../query/hooks.js';
import { Switch } from '../primitives/Toggle.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { officeSubmitKeys, sendKeyed } from '../../office-records/submitKeys.js';
import {
  Button,
  Chip,
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  type FilterChipOption,
  type TableColumn,
} from '../../pump-ds/index.js';
import { countOf } from '../../utils/ledgerWindow.js';
import {
  filterMembers,
  loginIdentity,
  memberCounts,
  memberState,
  memberStations,
  type MemberFilter,
} from '../Organization/organizationModel.js';
import { PermissionsDrawer } from './PermissionsDrawer.js';
import { RoleMatrixDrawer } from './RoleMatrixDrawer.js';
import {
  MemberDrawer,
  ResetPasswordDrawer,
  useTeamCache,
  userService,
  type Credentials,
} from './TeamMemberDrawers.js';

export { defaultNewMemberStationIds } from './TeamMemberDrawers.js';

/** A member's Role as one neutral chip: a Role is not a state, so it carries no tone. */
const RoleChip: React.FC<{ role?: string | null }> = ({ role }) =>
  role ? (
    <Chip tone="neutral" size="md">
      {role}
    </Chip>
  ) : null;

const buildUserColumns = (
  stations: Station[],
  startEdit: (u: any) => void,
  onReset: (u: any) => void,
  onToggleActive: (u: any) => void,
  onPermissions: (u: any) => void,
): TableColumn<any>[] => [
  {
    id: 'name',
    header: 'Member',
    kind: 'text',
    emphasis: true,
    value: (u) => u.fullName,
    width: '28%',
    cell: (u) => {
      const login = loginIdentity(u);
      return (
        <span className="inline-flex min-w-0 flex-col items-start leading-tight">
          <span className="font-medium text-ink-strong">{u.fullName}</span>
          <span className="mt-0.5 truncate font-mono text-[12px] text-ink-muted">
            {login ?? 'No login'}
          </span>
        </span>
      );
    },
  },
  {
    id: 'role',
    header: 'Role',
    kind: 'text',
    value: (u) => u.role,
    width: '13%',
    cell: (u) => (
      <span className="inline-flex items-center gap-1">
        <RoleChip role={u.hasLogin ? u.role : null} />
        {u.hasLogin && u.hasCustomPermissions && (
          <Chip tone="info" size="md">
            Custom
          </Chip>
        )}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'status',
    value: (u) => memberState(u),
    width: '13%',
  },
  {
    id: 'stations',
    header: 'Stations',
    kind: 'text',
    value: (u) => memberStations(u, stations),
    cell: (u) => <span className="text-ink-muted">{memberStations(u, stations)}</span>,
  },
  {
    id: 'actions',
    header: '',
    kind: 'text',
    value: () => null,
    width: '16%',
    cell: (u) => {
      const isActive = u.status !== 'INACTIVE';
      return (
        <span className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            title="Edit member"
            aria-label="Edit member"
            onClick={() => startEdit(u)}
          >
            <Icon name="edit" size="xs" />
          </Button>
          {u.hasLogin && (
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              title="Permissions"
              aria-label="Permissions"
              onClick={() => onPermissions(u)}
            >
              <Icon name="shield" size="xs" />
            </Button>
          )}
          {u.hasLogin && (
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              title="Reset password"
              aria-label="Reset password"
              onClick={() => onReset(u)}
            >
              <Icon name="key" size="xs" />
            </Button>
          )}
          {u.hasLogin && (
            <span
              title={isActive ? 'Deactivate login' : 'Activate login'}
              className="ml-1 inline-flex items-center"
            >
              <Switch
                checked={isActive}
                onChange={() => onToggleActive(u)}
                aria-label={isActive ? 'Deactivate login' : 'Activate login'}
              />
            </span>
          )}
        </span>
      );
    },
  },
];

export interface UserRolesAssignmentProps {
  /** The station the operator is working in; pre-checked for a new member (#299). */
  currentStationId?: string | null;
}

const EXPLAINER_KEY = 'pump.team.permissionsExplainer.dismissed';
const explainerDismissed = (): boolean => {
  try {
    return localStorage.getItem(EXPLAINER_KEY) === '1';
  } catch {
    return false;
  }
};
const dismissExplainer = () => {
  try {
    localStorage.setItem(EXPLAINER_KEY, '1');
  } catch {
    /* persistence is best effort */
  }
};

const members = (n: number) => countOf(n, 'member', 'members');

/** The open drawer: edit a member (or hand over a reset login), or reset a password. */
type TeamDrawer =
  | { kind: 'member'; user: any; credentials?: Credentials }
  | { kind: 'reset'; user: any }
  | { kind: 'permissions'; user: any };

/**
 * Organization › Team (#538): the org-wide team list (Table module, status
 * vocabulary, neutral Role chips) with its filters in the section header, and
 * the edit and reset-password drawers. A new member is added from the page's
 * actions (`OrganizationOverview`). Every save sends an Idempotency-Key; the
 * list refreshes in the background.
 */
export const UserRolesAssignment: React.FC<UserRolesAssignmentProps> = ({
  currentStationId = null,
}) => {
  const toast = useToast();
  const runTask = useRunTask();
  const team = useTeamCache();
  // Read through the shared static-tier hooks rather than fetching into local
  // state: the team list is already cached, and saves write the cache directly,
  // so a local mirror would only be a second source of truth.
  const usersQ = useUsers();
  const stationsQ = useStations();
  const users = useMemo<any[]>(() => usersQ.data ?? [], [usersQ.data]);
  const stations = useMemo<Station[]>(() => stationsQ.data ?? [], [stationsQ.data]);

  const [filter, setFilter] = useState<MemberFilter>('all');
  const [search, setSearch] = useState('');
  const counts = memberCounts(users);
  const rows = useMemo(() => filterMembers(users, filter, search), [users, filter, search]);
  const filtered = filter !== 'all' || !!search.trim();

  // Each drawer mounts fresh per open (keyed), so its form and its submit key
  // start new. The last drawer is kept while it closes, so it does not change
  // under the closing animation.
  const [drawer, setDrawer] = useState<TeamDrawer | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const open = (next: TeamDrawer) => {
    setDrawerKey((k) => k + 1);
    setDrawer(next);
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);

  // One click is one logical submit; a retry of the same switch after an
  // unknown outcome recovers its key from the shared store.
  const toggleActive = async (u: any) => {
    const reactivate = u.status === 'INACTIVE';
    let updated: any;
    try {
      updated = await sendKeyed(
        officeSubmitKeys.session(`team:${reactivate ? 'reactivate' : 'deactivate'}:${u.id}`),
        null,
        (idempotencyKey) =>
          reactivate
            ? userService.reactivateUser(u.id, { idempotencyKey })
            : userService.deactivateUser(u.id, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(
        withNextStep(err.message || "Couldn't update the member", 'Try again from their row.'),
      );
      return;
    }
    team.merge({ ...u, ...updated });
    toast.success(reactivate ? 'Member reactivated.' : 'Member deactivated.');
  };

  const columns = buildUserColumns(
    stations,
    (user) => open({ kind: 'member', user }),
    (user) => open({ kind: 'reset', user }),
    (u) => runTask(toggleActive(u), 'Could not update the team member.'),
    (user) => open({ kind: 'permissions', user }),
  );
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [explainer, setExplainer] = useState(() => !explainerDismissed());

  const options: FilterChipOption<MemberFilter>[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'active', label: 'Active', count: counts.active },
    ...(counts.inactive > 0
      ? [{ value: 'inactive', label: 'Inactive', count: counts.inactive } as const]
      : []),
    ...(counts['no-login'] > 0
      ? [{ value: 'no-login', label: 'No login', count: counts['no-login'] } as const]
      : []),
  ];

  return (
    <section className="flex flex-col gap-2">
      {explainer && (
        <div
          role="note"
          className="flex items-start justify-between gap-3 rounded-card border border-border-soft bg-surface-alt p-3 text-[12px] text-ink-default"
        >
          <span>
            <strong className="text-ink-strong">Permissions are now per member.</strong> Each Role
            starts with default Permissions; an Owner can switch individual ones on or off from a
            member&apos;s <em>Permissions</em> button. See what each role can do first.
          </span>
          <span className="flex shrink-0 gap-1">
            <Button variant="secondary" size="xs" onClick={() => setMatrixOpen(true)}>
              What each role can do
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                dismissExplainer();
                setExplainer(false);
              }}
            >
              Got it
            </Button>
          </span>
        </div>
      )}
      <SectionHeader
        title="Team"
        action={{ label: 'What each role can do', onClick: () => setMatrixOpen(true) }}
        subtitle={
          usersQ.data
            ? filtered
              ? `${rows.length} of ${users.length}`
              : members(users.length)
            : undefined
        }
        controls={{
          filters: usersQ.data && users.length > 0 && (
            <FilterChips
              aria-label="Show members"
              options={options}
              value={filter}
              onChange={setFilter}
            />
          ),
          search: (
            <div className="w-[200px]">
              <SearchInput
                inputSize="sm"
                value={search}
                onChange={setSearch}
                placeholder="Search name / phone / email…"
              />
            </div>
          ),
        }}
      />
      <DataSection
        title="team members"
        query={[usersQ, stationsQ]}
        placeholderHeight={280}
        flush
        isEmpty={rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="users" size="md" />}
              title={users.length === 0 ? 'No team members yet' : 'No matching members'}
              description={
                users.length === 0
                  ? 'Add members with an email or phone, set their password, and manage access.'
                  : 'Choose another filter or clear the search.'
              }
            />
          </div>
        }
      >
        <InteractiveTable bare columns={columns} rows={rows} rowKey={(u) => u.id} title="team" />
      </DataSection>

      <MemberDrawer
        key={`member-${drawerKey}`}
        isOpen={isOpen && drawer?.kind === 'member'}
        editingUser={drawer?.kind === 'member' ? drawer.user : null}
        credentials={drawer?.kind === 'member' ? drawer.credentials : null}
        currentStationId={currentStationId}
        onClose={close}
      />
      <PermissionsDrawer
        key={`permissions-${drawerKey}`}
        isOpen={isOpen && drawer?.kind === 'permissions'}
        user={drawer?.kind === 'permissions' ? drawer.user : null}
        onClose={close}
      />
      <RoleMatrixDrawer isOpen={matrixOpen} onClose={() => setMatrixOpen(false)} />
      <ResetPasswordDrawer
        key={`reset-${drawerKey}`}
        isOpen={isOpen && drawer?.kind === 'reset'}
        user={drawer?.kind === 'reset' ? drawer.user : null}
        onClose={close}
        onReset={(credentials) =>
          drawer && open({ kind: 'member', user: drawer.user, credentials })
        }
      />
    </section>
  );
};
