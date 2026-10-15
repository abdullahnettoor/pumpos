import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CloudUserAssignmentService } from '../../services/cloud.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useStations, useUsers } from '../../query/hooks.js';
import { INDIAN_MOBILE_MESSAGE, normalizeIndianMobile, Station } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { Field, Select, TextInput } from '../primitives/Field.js';
import { Checkbox, Switch } from '../primitives/Toggle.js';
import { useToast, type ToastApi } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useKeyedSaves } from '../../office-records/useKeyedSaves.js';
import {
  Button,
  Chip,
  DataSection,
  EmptyState,
  FilterChips,
  Form,
  Icon,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  SegmentedControl,
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

const userService = new CloudUserAssignmentService();

const userFormSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address').or(z.literal('')).optional().nullable(),
  // Blank, or a valid Indian mobile (#300); required only for phone login,
  // which handleCreateOrUpdate checks against the chosen identity.
  phone: z
    .string()
    .refine((v) => v.trim() === '' || normalizeIndianMobile(v) !== null, INDIAN_MOBILE_MESSAGE)
    .optional()
    .nullable(),
  password: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  role: z.enum(['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant']),
  enableAppAccess: z.boolean(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

// --- helpers ---------------------------------------------------------------
function generatePassword(): string {
  // Readable, strong: avoids ambiguous chars (0/O, 1/l/I).
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let out = pick(upper) + pick(lower) + pick(digits);
  for (let i = 0; i < 7; i++) out += pick(all);
  return out
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy + tell the operator whether it worked, in one place.
 *
 * Clipboard access is blocked often enough (insecure origin, permission denied)
 * that "did it copy?" is a real question, and these credentials are the one
 * thing the operator cannot re-read later. The trailing `.catch` is the
 * rejection path for a `copy` that rejects rather than resolving false.
 */
function copyWithFeedback(
  copy: (text: string) => Promise<boolean>,
  text: string,
  label: string,
  toast: ToastApi,
): void {
  copy(text)
    .then((ok) => (ok ? toast.success(`${label} copied.`) : toast.error('Copy failed.')))
    .catch(() => toast.error('Copy failed.'));
}

/** A member's Role as one neutral chip: a Role is not a state, so it carries no tone. */
const RoleChip: React.FC<{ role?: string | null }> = ({ role }) =>
  role ? (
    <Chip tone="neutral" size="xs">
      {role}
    </Chip>
  ) : null;

const buildUserColumns = (
  stations: Station[],
  startEdit: (u: any) => void,
  onReset: (u: any) => void,
  onToggleActive: (u: any) => void,
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
    cell: (u) => <RoleChip role={u.hasLogin ? u.role : null} />,
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
    width: '13%',
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

/**
 * The stations a new member starts assigned to (#299): the station the operator
 * is working in, or the only station when the organization has just one. The
 * operator can still uncheck it and save with none.
 */
export function defaultNewMemberStationIds(
  stations: { id: string }[],
  currentStationId?: string | null,
): string[] {
  if (currentStationId && stations.some((s) => s.id === currentStationId)) {
    return [currentStationId];
  }
  return stations.length === 1 ? [stations[0].id] : [];
}

const members = (n: number) => countOf(n, 'member', 'members');

/** A password input with Generate and Copy beside it. */
const PasswordRow: React.FC<{
  input: React.ReactNode;
  onGenerate: () => void;
  onCopy: () => void;
  canCopy: boolean;
}> = ({ input, onGenerate, onCopy, canCopy }) => (
  <div className="flex gap-1.5">
    <div className="min-w-0 flex-1">{input}</div>
    <Button type="button" variant="secondary" size="md" onClick={onGenerate}>
      Generate
    </Button>
    <Button type="button" variant="secondary" size="md" disabled={!canCopy} onClick={onCopy}>
      Copy
    </Button>
  </div>
);

/**
 * Organization › Team (#538): the org-wide team list (Table module, status
 * vocabulary, neutral Role chips) with its filters in the section header, and
 * the member and reset-password drawers. Every save sends an Idempotency-Key;
 * the list refreshes in the background.
 */
export const UserRolesAssignment: React.FC<UserRolesAssignmentProps> = ({
  currentStationId = null,
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  const save = useKeyedSaves();
  // Read through the shared static-tier hooks rather than fetching into local
  // state: the team list is already cached, and `mergeUser` below writes the
  // cache directly, so a local mirror would only be a second source of truth.
  const usersQ = useUsers();
  const stationsQ = useStations();
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const stations = useMemo<Station[]>(() => stationsQ.data ?? [], [stationsQ.data]);

  const [filter, setFilter] = useState<MemberFilter>('all');
  const [search, setSearch] = useState('');
  const counts = memberCounts(users);
  const rows = useMemo(() => filterMembers(users, filter, search), [users, filter, search]);
  const filtered = filter !== 'all' || !!search.trim();

  // Drawer visibility state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Credentials card shown after provisioning a login account.
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);

  // Reset-password dialog state.
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Station assignments + identity type are managed outside react-hook-form: an
  // unregistered RHF field (set only via setValue) can be dropped from the
  // submitted payload, which previously left new members with no station
  // assignments and could mis-detect the identity type.
  const [stationIds, setStationIds] = useState<string[]>([]);
  const [identityType, setIdentityType] = useState<'Email' | 'Phone'>('Phone');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      status: 'ACTIVE' as const,
      role: 'Staff',
      enableAppAccess: true,
    },
  });

  const watchEnableAppAccess = watch('enableAppAccess');
  const watchRole = watch('role');
  const watchPassword = watch('password') || '';

  /** Refresh both lists in the background (used when a save could not be merged locally). */
  const refreshInBackground = (key: readonly unknown[] = queryKeys.users()) =>
    runTask(
      qc.invalidateQueries({ queryKey: key }),
      'Saved, but the team list could not be refreshed.',
    );

  // The row is written straight into the cache, so this only marks the key stale
  // for the next mount — `refetchType: 'none'` means nothing is refetched here.
  const mergeUser = (row: any) => {
    const merge = (list: any[] = []) =>
      list.some((u) => u.id === row.id)
        ? list.map((u) => (u.id === row.id ? { ...u, ...row } : u))
        : [...list, row];
    qc.setQueryData(queryKeys.users(), (prev: any[] | undefined) => merge(prev));
    runTask(
      qc.invalidateQueries({ queryKey: queryKeys.users(), refetchType: 'none' }),
      'Saved, but the team list could not be refreshed.',
    );
  };

  const handleCreateOrUpdate = async (values: UserFormValues) => {
    const wantsLogin = !!values.enableAppAccess;
    const isPhone = identityType === 'Phone';

    if (!editingUser && wantsLogin) {
      // Provisioning a new login account requires an identity + password.
      if (isPhone && (!values.phone || values.phone.trim() === '')) {
        setError('phone', { message: 'A phone number is required for phone login.' });
        return;
      }
      if (!isPhone && (!values.email || values.email.trim() === '')) {
        toast.error('An email address is required for email login.');
        return;
      }
      if (!values.password || values.password.length < 8) {
        toast.error('Set a password of at least 8 characters (use Generate).');
        return;
      }
    }

    const payload: any = {
      fullName: values.fullName,
      // For a phone identity we deliberately clear email so the server uses
      // the synthetic phone handle as the login identity.
      email: wantsLogin && !isPhone ? values.email : editingUser ? values.email || null : null,
      // One stored spelling, +91XXXXXXXXXX; the server normalizes too (#300).
      phone: normalizeIndianMobile(values.phone) ?? null,
      status: values.status,
      role: wantsLogin ? values.role : 'Staff',
      stationIds,
    };
    if (!editingUser && wantsLogin) {
      payload.enableAppAccess = true;
      payload.password = values.password;
    }

    let saved: any;
    try {
      saved = editingUser
        ? await save(`team:update:${editingUser.id}`, payload, (idempotencyKey) =>
            userService.updateUser(editingUser.id, payload, { idempotencyKey }),
          )
        : await save('team:create', payload, (idempotencyKey) =>
            userService.createUser(payload, { idempotencyKey }),
          );
    } catch (err: any) {
      toast.error(err.message || 'Failed to save team member');
      return;
    }

    // Show credentials to hand over when a fresh login was provisioned.
    if (!editingUser && wantsLogin) {
      const login = isPhone
        ? (normalizeIndianMobile(values.phone) ?? '')
        : (values.email || '').trim();
      setCredentials({ login, password: values.password || '' });
    } else {
      setIsFormOpen(false);
    }

    const rowId = editingUser?.id ?? saved?.id;
    if (!editingUser) {
      // The list response supplies server-derived fields such as `hasLogin`.
      // Refetch after provisioning instead of constructing a stale local row.
      refreshInBackground();
    } else if (rowId) {
      mergeUser({ ...(editingUser || {}), id: rowId, ...saved, ...payload });
    } else {
      refreshInBackground();
      refreshInBackground(queryKeys.stations());
    }
    toast.success(editingUser ? 'Team member updated.' : 'Team member added.');
    resetForm();
  };

  const startEdit = (u: any) => {
    setCredentials(null);
    setEditingUser(u);
    setStationIds(u.stationIds || []);
    setIdentityType(u.email ? 'Email' : 'Phone');
    reset({
      fullName: u.fullName,
      enableAppAccess: !!u.hasLogin,
      email: u.email || '',
      phone: u.phone || '',
      password: '',
      status: u.status || 'ACTIVE',
      role: u.role || 'Staff',
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditingUser(null);
    setStationIds(defaultNewMemberStationIds(stations, currentStationId));
    setIdentityType('Phone');
    reset({
      fullName: '',
      enableAppAccess: true,
      email: '',
      phone: '',
      password: '',
      status: 'ACTIVE',
      role: 'Staff',
    });
  };

  const openNew = () => {
    resetForm();
    setCredentials(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    resetForm();
    setCredentials(null);
    setIsFormOpen(false);
  };

  const handleStationCheckbox = (stationId: string, checked: boolean) => {
    setStationIds((prev) =>
      checked ? [...prev, stationId] : prev.filter((id) => id !== stationId),
    );
  };

  const openReset = (u: any) => {
    setResetTarget(u);
    setResetPassword(generatePassword());
  };

  const confirmReset = async () => {
    if (!resetTarget || resetPassword.length < 8) return;
    setResetBusy(true);
    try {
      await save(`team:reset:${resetTarget.id}`, { password: resetPassword }, (idempotencyKey) =>
        userService.resetUserPassword(resetTarget.id, resetPassword, { idempotencyKey }),
      );
      setCredentials({ login: loginIdentity(resetTarget) ?? '', password: resetPassword });
      toast.success('Password reset. Share the new credentials.');
      setResetTarget(null);
      setIsFormOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setResetBusy(false);
    }
  };

  const toggleActive = async (u: any) => {
    const reactivate = u.status === 'INACTIVE';
    let updated: any;
    try {
      updated = await save(
        `team:${reactivate ? 'reactivate' : 'deactivate'}:${u.id}`,
        null,
        (idempotencyKey) =>
          reactivate
            ? userService.reactivateUser(u.id, { idempotencyKey })
            : userService.deactivateUser(u.id, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member');
      return;
    }
    mergeUser({ ...u, ...updated });
    toast.success(reactivate ? 'Member reactivated.' : 'Member deactivated.');
  };

  const columns = buildUserColumns(stations, startEdit, openReset, (u) =>
    runTask(toggleActive(u), 'Could not update the team member.'),
  );

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
      <SectionHeader
        title="Team"
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
          actions: (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Icon name="plus" size="sm" />}
              onClick={openNew}
            >
              Add team member
            </Button>
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

      {/* Member drawer */}
      <Drawer
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingUser ? 'Edit team member' : 'New team member'}
      >
        {credentials ? (
          <CredentialsCard
            credentials={credentials}
            onDone={closeForm}
            onCopy={copyText}
            toast={toast}
          />
        ) : (
          <Form onSubmit={handleSubmit(handleCreateOrUpdate)} className="flex flex-col">
            <Field label="Full name" required error={errors.fullName?.message}>
              <TextInput
                placeholder="e.g. John Doe"
                invalid={!!errors.fullName}
                {...register('fullName')}
              />
            </Field>

            {!editingUser && (
              <div className="mb-4">
                <Checkbox
                  label="Enable app access (allows login)"
                  {...register('enableAppAccess')}
                />
              </div>
            )}

            {/* Identity picker — only when provisioning a new login */}
            {!editingUser && watchEnableAppAccess && (
              <div className="mb-4 flex flex-col rounded-card border border-border-soft bg-surface-alt p-3 pb-0">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-ink-muted">Login with</span>
                  <SegmentedControl
                    aria-label="Login with"
                    options={[
                      { value: 'Phone', label: 'Phone' },
                      { value: 'Email', label: 'Email' },
                    ]}
                    value={identityType}
                    onChange={setIdentityType}
                  />
                </div>

                {identityType === 'Email' ? (
                  <Field label="Email address" required error={errors.email?.message}>
                    <TextInput
                      type="email"
                      placeholder="e.g. john@station.com"
                      invalid={!!errors.email}
                      {...register('email')}
                    />
                  </Field>
                ) : (
                  <Field
                    label="Phone number"
                    required
                    error={errors.phone?.message}
                    hint="They sign in with this phone number + password. No SMS is sent."
                  >
                    <TextInput
                      type="tel"
                      placeholder="e.g. 98765 43210"
                      invalid={!!errors.phone}
                      aria-invalid={!!errors.phone}
                      {...register('phone')}
                    />
                  </Field>
                )}

                <Field label="Password" required>
                  <PasswordRow
                    input={
                      <TextInput
                        type="text"
                        className="font-mono"
                        placeholder="At least 8 characters"
                        {...register('password')}
                      />
                    }
                    onGenerate={() => setValue('password', generatePassword())}
                    onCopy={() => copyWithFeedback(copyText, watchPassword, 'Password', toast)}
                    canCopy={!!watchPassword}
                  />
                </Field>
              </div>
            )}

            {/* Profile phone for record-only / edit (non-login) */}
            {(editingUser || !watchEnableAppAccess) && (
              <Field label="Phone number" error={errors.phone?.message}>
                <TextInput
                  type="tel"
                  placeholder="e.g. 98765 43210"
                  invalid={!!errors.phone}
                  aria-invalid={!!errors.phone}
                  {...register('phone')}
                />
              </Field>
            )}

            {(editingUser ? !!editingUser.hasLogin : watchEnableAppAccess) && (
              <Field label="Role">
                <Select {...register('role')}>
                  <option value="Owner">Owner (Global Admin)</option>
                  <option value="Manager">Manager</option>
                  <option value="Accountant">Accountant</option>
                  <option value="Staff">Staff</option>
                  <option value="Attendant">Attendant (Mobile handover)</option>
                </Select>
              </Field>
            )}

            {watchRole !== 'Owner' && (
              <div
                role="group"
                aria-labelledby="team-assign-stations"
                className="mb-4 flex flex-col gap-2"
              >
                <span id="team-assign-stations" className="field-label">
                  Assign stations
                </span>
                {stations.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={`${s.name} (${s.code})`}
                    checked={stationIds.includes(s.id)}
                    onChange={(e) => handleStationCheckbox(s.id, e.target.checked)}
                  />
                ))}
              </div>
            )}

            {editingUser && (
              <Field label="Status">
                <Select {...register('status')}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              </Field>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSubmitting}
              className="mt-2"
            >
              {editingUser ? 'Save changes' : 'Add member'}
            </Button>
          </Form>
        )}
      </Drawer>

      {/* Reset password drawer */}
      <Drawer isOpen={!!resetTarget} onClose={() => setResetTarget(null)} title="Reset password">
        {resetTarget && (
          <div className="flex flex-col">
            <p className="mb-4 text-[13px] text-ink-default">
              Set a new password for <strong>{resetTarget.fullName}</strong> (
              {loginIdentity(resetTarget) ?? '—'}). The old password stops working immediately.
            </p>
            <Field label="New password" required>
              <PasswordRow
                input={
                  <TextInput
                    type="text"
                    className="font-mono"
                    aria-label="New password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                }
                onGenerate={() => setResetPassword(generatePassword())}
                onCopy={() => copyWithFeedback(copyText, resetPassword, 'Password', toast)}
                canCopy={!!resetPassword}
              />
            </Field>
            <Button
              variant="primary"
              size="md"
              loading={resetBusy}
              disabled={resetPassword.length < 8}
              onClick={() => runTask(confirmReset(), 'Could not reset the password.')}
            >
              Set new password
            </Button>
          </div>
        )}
      </Drawer>
    </section>
  );
};

/** One credential to hand over, with its Copy button. */
const CredentialRow: React.FC<{ label: string; value: string; onCopy: () => void }> = ({
  label,
  value,
  onCopy,
}) => (
  <div className="flex items-center justify-between gap-2 rounded-[8px] border border-border-soft bg-surface-alt px-2.5 py-2">
    <div className="flex min-w-0 flex-col">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <span className="truncate font-mono text-[13px] text-ink-strong">{value}</span>
    </div>
    <Button variant="secondary" size="xs" onClick={onCopy}>
      Copy
    </Button>
  </div>
);

const CredentialsCard: React.FC<{
  credentials: { login: string; password: string };
  onDone: () => void;
  onCopy: (text: string) => Promise<boolean>;
  toast: ReturnType<typeof useToast>;
}> = ({ credentials, onDone, onCopy, toast }) => (
  <div className="flex flex-col gap-3.5">
    <div
      role="status"
      className="flex items-center gap-2 rounded-[8px] bg-success-bg px-3 py-2.5 text-[12px] font-semibold text-success-fg"
    >
      <Icon name="check" size="xs" />
      Login ready. Copy and hand these over — the password is shown only once.
    </div>
    <CredentialRow
      label="Login"
      value={credentials.login}
      onCopy={() => copyWithFeedback(onCopy, credentials.login, 'Login', toast)}
    />
    <CredentialRow
      label="Password"
      value={credentials.password}
      onCopy={() => copyWithFeedback(onCopy, credentials.password, 'Password', toast)}
    />
    <Button
      variant="secondary"
      size="sm"
      onClick={() =>
        copyWithFeedback(
          onCopy,
          `Login: ${credentials.login}\nPassword: ${credentials.password}`,
          'Credentials',
          toast,
        )
      }
    >
      Copy both
    </Button>
    <Button variant="primary" size="md" onClick={onDone}>
      Done
    </Button>
  </div>
);
