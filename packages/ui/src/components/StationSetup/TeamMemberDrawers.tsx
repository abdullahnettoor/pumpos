import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  hasOrganizationWideStationAccess,
  INDIAN_MOBILE_MESSAGE,
  normalizeIndianMobile,
  type Station,
} from '@pump/shared';
import { CloudUserAssignmentService } from '../../services/cloud.js';
import { queryKeys, useStations } from '../../query/hooks.js';
import { Drawer } from '../Drawer.js';
import { Field, Select, TextInput } from '../primitives/Field.js';
import { Checkbox } from '../primitives/Toggle.js';
import { useToast, withNextStep, type ToastApi } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { Button, Form, Icon, SegmentedControl } from '../../pump-ds/index.js';
import { loginIdentity } from '../Organization/organizationModel.js';

/** The credentials could not reach the clipboard (#606: say what to do next). */
const COPY_FAILED = 'Copy failed. Select the text and copy it, or note it down.';

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

export interface Credentials {
  login: string;
  password: string;
}

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
function copyWithFeedback(text: string, label: string, toast: ToastApi): void {
  copyText(text)
    .then((ok) => (ok ? toast.success(`${label} copied.`) : toast.error(COPY_FAILED)))
    .catch(() => toast.error(COPY_FAILED));
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

/**
 * Writes to the team list. A saved row is merged straight into the cache, so
 * the key is only marked stale (`refetchType: 'none'`); a new member is
 * refetched for its server-derived fields (`hasLogin`). Both run in the
 * background: the save already succeeded.
 */
export function useTeamCache() {
  const qc = useQueryClient();
  const runTask = useRunTask();
  const refresh = (refetchType?: 'none') =>
    runTask(
      qc.invalidateQueries({ queryKey: queryKeys.users(), refetchType }),
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

// --- member drawer -----------------------------------------------------------

export interface MemberDrawerProps {
  isOpen: boolean;
  /** null = a new member. */
  editingUser: any | null;
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
  const [identityType, setIdentityType] = useState<'Email' | 'Phone'>(
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
      saved = await save(payload, (idempotencyKey) =>
        editingUser
          ? userService.updateUser(editingUser.id, payload, { idempotencyKey })
          : userService.createUser(payload, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(
        withNextStep(
          err.message || "Couldn't save the team member",
          'Check the details and save again.',
        ),
      );
      return;
    }

    if (editingUser) team.merge({ ...editingUser, ...saved, ...payload, id: editingUser.id });
    else team.refresh();
    toast.success(editingUser ? 'Team member updated.' : 'Team member added.');

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
              <Checkbox label="Enable app access (allows login)" {...register('enableAppAccess')} />
            </div>
          )}

          {/* Identity picker — only when provisioning a new login */}
          {!editingUser && watchEnableAppAccess && (
            <div className="mb-4 flex flex-col rounded-card border border-border-soft bg-surface-alt p-3 pb-0">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[12px] font-semibold text-ink-muted">Login with</span>
                <SegmentedControl
                  aria-label="Login with"
                  stretch
                  className="flex-1"
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
                  onCopy={() => copyWithFeedback(watchPassword, 'Password', toast)}
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

          <Button type="submit" variant="primary" size="md" loading={isSubmitting} className="mt-2">
            {editingUser ? 'Save changes' : 'Add member'}
          </Button>
        </Form>
      )}
    </Drawer>
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

// --- credentials -------------------------------------------------------------

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
  credentials: Credentials;
  onDone: () => void;
  toast: ToastApi;
}> = ({ credentials, onDone, toast }) => (
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
      onCopy={() => copyWithFeedback(credentials.login, 'Login', toast)}
    />
    <CredentialRow
      label="Password"
      value={credentials.password}
      onCopy={() => copyWithFeedback(credentials.password, 'Password', toast)}
    />
    <Button
      variant="secondary"
      size="sm"
      onClick={() =>
        copyWithFeedback(
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
