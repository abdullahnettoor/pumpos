import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  can,
  canActOnTeamMember,
  hasOrganizationWideStationAccess,
  INDIAN_MOBILE_MESSAGE,
  normalizeIndianMobile,
  type Role,
  type Station,
} from '@pump/shared';
import { CloudUserAssignmentService } from '../../services/cloud.js';
import { fetchRoleChangePreview, queryKeys, useStations } from '../../query/hooks.js';
import { Drawer } from '../Drawer.js';
import { Field, Select, TextInput } from '../primitives/Field.js';
import { Checkbox } from '../primitives/Toggle.js';
import { currentPrincipal } from '../../access/effectivePrincipal.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { labelOf } from './permissionsModel.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { Button, Form } from '../../pump-ds/index.js';
import { loginIdentity } from '../Organization/organizationModel.js';
import {
  CredentialsCard,
  LoginIdentityFields,
  PasswordRow,
  copyWithFeedback,
  generatePassword,
  type Credentials,
  type LoginIdentityType,
} from './teamLoginParts.js';

export type { Credentials };

/**
 * The Team drawers (#538): new / edit member (with the credentials to hand
 * over) and reset password. Each mounts fresh per open (the parent keys it), so
 * its form starts from its defaults and its save is one logical submit with
 * its own Idempotency-Key (`useKeyedSave`).
 */

export const userService = new CloudUserAssignmentService();

const userFormSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address').or(z.literal('')).optional().nullable(),
  // Blank, or a valid Indian mobile (#300); required only for phone login,
  // which the submit checks against the chosen identity.
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

/**
 * Writes to the team list. A saved row is merged straight into the cache, so
 * the key is only marked stale (`refetchType: 'none'`); a new member is
 * refetched for its server-derived fields (`hasLogin`). Both run in the
 * background: the save already succeeded.
 */
export function useTeamCache() {
  const qc = useQueryClient();
  const runTask = useRunTask();
  // Adding, reactivating or deactivating a login moves `login_count` usage.
  const refresh = (refetchType?: 'none') =>
    runTask(
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.users(), refetchType }),
        qc.invalidateQueries({ queryKey: queryKeys.access() }),
      ]),
      'Saved, but the team list could not be refreshed.',
    );
  return {
    refresh: () => refresh(),
    merge: (row: { id: string }) => {
      qc.setQueryData(queryKeys.users(), (prev: { id: string }[] | undefined) =>
        (prev ?? []).some((u) => u.id === row.id)
          ? (prev ?? []).map((u) => (u.id === row.id ? { ...u, ...row } : u))
          : [...(prev ?? []), row],
      );
      refresh('none');
    },
  };
}

// --- member drawer -----------------------------------------------------------

/** A team member as the Team list and the member drawer read it. */
export interface TeamMember {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  role?: Role;
  hasLogin?: boolean;
  hasCustomPermissions?: boolean;
  stationIds?: string[];
}

/** What the member drawer sends (create or update). */
interface MemberPayload {
  fullName: string;
  email?: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  role: Role;
  stationIds: string[];
  enableAppAccess?: boolean;
  password?: string | null;
}

/** The server's answer to a member save; `droppedPermissionChanges` is set when a Role change reset custom Permissions. */
type SavedMember = Partial<TeamMember> & {
  droppedPermissionChanges?: { granted: string[]; revoked: string[] } | null;
};

const errorMessage = (err: unknown): string | undefined =>
  err instanceof Error ? err.message : undefined;

export interface MemberDrawerProps {
  isOpen: boolean;
  /** null = a new member. */
  editingUser: TeamMember | null;
  /** Shown instead of the form: the new login to hand over (after a password reset). */
  credentials?: Credentials | null;
  /** The station the operator is working in; pre-checked for a new member (#299). */
  currentStationId?: string | null;
  onClose: () => void;
}

export const MemberDrawer: React.FC<MemberDrawerProps> = ({
  isOpen,
  editingUser,
  credentials: shownCredentials = null,
  currentStationId = null,
  onClose,
}) => {
  const toast = useToast();
  const team = useTeamCache();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const save = useKeyedSave(editingUser ? `team:update:${editingUser.id}` : 'team:create');
  const stationsQ = useStations();
  const stations = useMemo<Station[]>(() => stationsQ.data ?? [], [stationsQ.data]);

  const [credentials, setCredentials] = useState<Credentials | null>(shownCredentials);
  // Station assignments + identity type are managed outside react-hook-form: an
  // unregistered RHF field (set only via setValue) can be dropped from the
  // submitted payload, which previously left new members with no station
  // assignments and could mis-detect the identity type.
  const [stationIds, setStationIds] = useState<string[]>(() =>
    editingUser
      ? (editingUser.stationIds ?? [])
      : defaultNewMemberStationIds(stations, currentStationId),
  );
  const [identityType, setIdentityType] = useState<LoginIdentityType>(
    editingUser?.email ? 'Email' : 'Phone',
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: editingUser
      ? {
          fullName: editingUser.fullName,
          enableAppAccess: !!editingUser.hasLogin,
          email: editingUser.email || '',
          phone: editingUser.phone || '',
          password: '',
          status: editingUser.status || 'ACTIVE',
          role: editingUser.role || 'Staff',
        }
      : {
          fullName: '',
          email: '',
          phone: '',
          password: '',
          status: 'ACTIVE',
          role: 'Staff',
          enableAppAccess: true,
        },
  });

  const watchEnableAppAccess = watch('enableAppAccess');
  const watchRole = watch('role');
  const watchPassword = watch('password') || '';

  const onSubmit = async (values: UserFormValues) => {
    const wantsLogin = !!values.enableAppAccess;
    const isPhone = identityType === 'Phone';

    if (!editingUser && wantsLogin) {
      // Provisioning a new login account requires an identity + password.
      if (isPhone && (!values.phone || values.phone.trim() === '')) {
        setError('phone', { message: 'A phone number is required for phone login.' });
        return;
      }
      if (!isPhone && (!values.email || values.email.trim() === '')) {
        toast.error(
          withNextStep(
            'An email address is required for email login',
            'Enter one, or choose username login.',
          ),
        );
        return;
      }
      if (!values.password || values.password.length < 8) {
        toast.error(
          withNextStep(
            'The password needs at least 8 characters',
            'Type a longer one or use Generate.',
          ),
        );
        return;
      }
    }

    const payload: MemberPayload = {
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

    // A Role change resets the member's custom Permissions: say what is lost first.
    // If the preview cannot be read the change is not saved: the Owner must see the warning.
    if (editingUser && editingUser.hasLogin && payload.role !== editingUser.role) {
      try {
        const preview = await fetchRoleChangePreview(qc, editingUser.id, payload.role);
        const d = preview.droppedChanges;
        if (d) {
          const lines = [
            ...d.granted.map((id) => `${labelOf(id)} (extra)`),
            ...d.revoked.map((id) => `${labelOf(id)} (removed)`),
          ];
          const ok = await confirm({
            title: `Change role to ${payload.role}?`,
            message: `Changing the role resets this member to the ${payload.role} defaults. These custom Permissions will be dropped: ${lines.join(', ')}.`,
            confirmLabel: 'Change role',
            danger: true,
          });
          if (!ok) return;
        }
      } catch (err) {
        toast.error(
          withNextStep(
            errorMessage(err) || "Couldn't check what a role change would reset",
            'Nothing was saved. Try again.',
          ),
        );
        return;
      }
    }

    let saved: SavedMember;
    try {
      saved = await save(payload, (idempotencyKey) =>
        editingUser
          ? userService.updateUser(editingUser.id, payload, { idempotencyKey })
          : userService.createUser(payload, { idempotencyKey }),
      );
    } catch (err) {
      toast.error(
        withNextStep(
          errorMessage(err) || "Couldn't save the team member",
          'Check the details and save again.',
        ),
      );
      return;
    }

    if (editingUser)
      team.merge({
        ...editingUser,
        ...saved,
        ...payload,
        ...(saved?.droppedPermissionChanges ? { hasCustomPermissions: false } : {}),
        id: editingUser.id,
      });
    else team.refresh();
    const dropped = saved?.droppedPermissionChanges;
    if (editingUser) {
      void qc.invalidateQueries({ queryKey: queryKeys.userPermissions(editingUser.id) });
      void qc.invalidateQueries({ queryKey: ['user-role-change-preview', editingUser.id] });
    }
    if (dropped) {
      toast.success(
        `Team member updated. Custom Permissions dropped: ${[...dropped.granted, ...dropped.revoked].map(labelOf).join(', ')}.`,
      );
    } else {
      toast.success(editingUser ? 'Team member updated.' : 'Team member added.');
    }

    // Show credentials to hand over when a fresh login was provisioned.
    if (!editingUser && wantsLogin) {
      const login = isPhone
        ? (normalizeIndianMobile(values.phone) ?? '')
        : (values.email || '').trim();
      setCredentials({ login, password: values.password || '' });
    } else {
      onClose();
    }
  };

  const offerAppAccess =
    !!editingUser && editingUser.hasLogin === false && canGiveAppAccess(editingUser, stations);

  const toggleStation = (stationId: string, checked: boolean) =>
    setStationIds((prev) =>
      checked ? [...prev, stationId] : prev.filter((id) => id !== stationId),
    );

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={editingUser ? 'Edit team member' : 'New team member'}
    >
      {credentials ? (
        <CredentialsCard credentials={credentials} onDone={onClose} toast={toast} />
      ) : (
        <>
          <Form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
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
                <LoginIdentityFields
                  identityType={identityType}
                  onIdentityTypeChange={setIdentityType}
                  email={register('email')}
                  phone={register('phone')}
                  password={register('password')}
                  emailError={errors.email?.message}
                  phoneError={errors.phone?.message}
                  passwordValue={watchPassword}
                  onGeneratePassword={() => setValue('password', generatePassword())}
                  toast={toast}
                />
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

            {!hasOrganizationWideStationAccess({ role: watchRole }) && (
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
                    onChange={(e) => toggleStation(s.id, e.target.checked)}
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
          {offerAppAccess && editingUser && (
            <GrantAppAccessSection member={editingUser} onGranted={setCredentials} />
          )}
        </>
      )}
    </Drawer>
  );
};

// --- enable app access -------------------------------------------------------

/**
 * App access for a member who has no login (#462). The identity rules are the
 * create flow's: exactly one of phone or email, and a password of at least 8
 * characters. `identityType` lives in the form so the schema can ask for the
 * right one.
 */
const appAccessSchema = z
  .object({
    identityType: z.enum(['Phone', 'Email']),
    email: z.string(),
    phone: z.string(),
    password: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.identityType === 'Phone') {
      if (v.phone.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['phone'],
          message: 'A phone number is required for phone login.',
        });
      } else if (normalizeIndianMobile(v.phone) === null) {
        ctx.addIssue({ code: 'custom', path: ['phone'], message: INDIAN_MOBILE_MESSAGE });
      }
    } else if (!z.string().email().safeParse(v.email.trim()).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message:
          v.email.trim() === ''
            ? 'An email address is required for email login.'
            : 'Invalid email address',
      });
    }
    if (v.password.length < 8) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'The password needs at least 8 characters',
      });
    }
  });

type AppAccessValues = z.infer<typeof appAccessSchema>;

/** May this caller give this member a login? The server's `team.manage` + `canActOnTarget`. */
function canGiveAppAccess(member: TeamMember, stations: Station[]): boolean {
  const principal = currentPrincipal();
  return (
    can(principal, 'team.manage') &&
    canActOnTeamMember(
      { role: principal.role, stationIds: stations.map((s) => s.id) },
      member.role ?? 'Staff',
      member.stationIds ?? [],
    )
  );
}

const GrantAppAccessSection: React.FC<{
  member: TeamMember;
  onGranted: (credentials: Credentials) => void;
}> = ({ member, onGranted }) => {
  const toast = useToast();
  const team = useTeamCache();
  const qc = useQueryClient();
  const save = useKeyedSave(`team:app-access:${member.id}`);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AppAccessValues>({
    resolver: zodResolver(appAccessSchema),
    defaultValues: {
      identityType: member.email ? 'Email' : 'Phone',
      email: member.email || '',
      phone: member.phone || '',
      password: '',
    },
  });
  const identityType = watch('identityType');
  const password = watch('password');

  const onSubmit = async (values: AppAccessValues) => {
    setServerError(null);
    const isPhone = values.identityType === 'Phone';
    // Exactly one identity: the server refuses both.
    const login = isPhone ? (normalizeIndianMobile(values.phone) ?? '') : values.email.trim();
    const body = isPhone
      ? { phone: login, password: values.password }
      : { email: login, password: values.password };
    let saved: Awaited<ReturnType<typeof userService.grantAppAccess>>;
    try {
      saved = await save(body, (idempotencyKey) =>
        userService.grantAppAccess(member.id, body, { idempotencyKey }),
      );
    } catch (err) {
      setServerError(errorMessage(err) || "Couldn't give app access. Try again.");
      return;
    }
    const row: TeamMember = { ...member, ...saved, role: saved.role as Role, hasLogin: true };
    team.merge(row);
    void qc.invalidateQueries({ queryKey: queryKeys.userPermissions(member.id) });
    toast.success('App access enabled.');
    onGranted({ login, password: values.password });
  };

  return (
    <section
      aria-labelledby="team-enable-app-access"
      className="mt-5 flex flex-col border-t border-border-soft pt-4"
    >
      <h3 id="team-enable-app-access" className="text-[13px] font-semibold text-ink-strong">
        Enable app access
      </h3>
      <p className="mb-3 mt-0.5 text-[12px] text-ink-muted">
        {member.fullName} has no login yet. Create one so they can sign in.
      </p>
      <Form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col rounded-card border border-border-soft bg-surface-alt p-3 pb-0"
      >
        <LoginIdentityFields
          identityType={identityType}
          onIdentityTypeChange={(type) => setValue('identityType', type)}
          email={register('email')}
          phone={register('phone')}
          password={register('password')}
          emailError={errors.email?.message}
          phoneError={errors.phone?.message}
          passwordError={errors.password?.message}
          passwordValue={password}
          onGeneratePassword={() => setValue('password', generatePassword())}
          toast={toast}
        />
        {serverError && (
          <p role="alert" className="field-error mb-3">
            {serverError}
          </p>
        )}
        <Button type="submit" variant="secondary" size="md" loading={isSubmitting} className="mb-3">
          Enable app access
        </Button>
      </Form>
    </section>
  );
};

// --- reset password drawer ---------------------------------------------------

export interface ResetPasswordDrawerProps {
  isOpen: boolean;
  user: any | null;
  onClose: () => void;
  /** The new login to hand over. */
  onReset: (credentials: Credentials) => void;
}

export const ResetPasswordDrawer: React.FC<ResetPasswordDrawerProps> = ({
  isOpen,
  user,
  onClose,
  onReset,
}) => {
  const toast = useToast();
  const runTask = useRunTask();
  const save = useKeyedSave(`team:reset:${user?.id ?? ''}`);
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!user || password.length < 8) return;
    setBusy(true);
    try {
      await save({ password }, (idempotencyKey) =>
        userService.resetUserPassword(user.id, password, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(
        withNextStep(err.message || "Couldn't reset the password", 'Try resetting it again.'),
      );
      setBusy(false);
      return;
    }
    setBusy(false);
    toast.success('Password reset. Share the new credentials.');
    onReset({ login: loginIdentity(user) ?? '', password });
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Reset password">
      {user && (
        <div className="flex flex-col">
          <p className="mb-4 text-[13px] text-ink-default">
            Set a new password for <strong>{user.fullName}</strong> ({loginIdentity(user) ?? '—'}).
            The old password stops working immediately.
          </p>
          <Field label="New password" required>
            <PasswordRow
              input={
                <TextInput
                  type="text"
                  className="font-mono"
                  aria-label="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              }
              onGenerate={() => setPassword(generatePassword())}
              onCopy={() => copyWithFeedback(password, 'Password', toast)}
              canCopy={!!password}
            />
          </Field>
          <Button
            variant="primary"
            size="md"
            loading={busy}
            disabled={password.length < 8}
            onClick={() => runTask(confirm(), 'Could not reset the password.')}
          >
            Set new password
          </Button>
        </div>
      )}
    </Drawer>
  );
};
