import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@pump/ui';
import {
  generatePassword,
  memberFormSchema,
  memberRequest,
  type MemberFormMode,
  type MemberFormValues,
} from '../../lib/team/form.js';
import type { TeamFailure } from '../../lib/team/failure.js';
import { assignableRoles } from '../../lib/team/permissions.js';
import type { TeamActor } from '../../lib/team/permissions.js';
import { loginIdentity } from '../../lib/team/members.js';
import type { TeamWriteResult } from './useTeamWrite.js';
import { CredentialsCard } from './CredentialsCard.js';
import {
  ChoiceChips,
  FormRefusal,
  SheetButtons,
  StationChecks,
  SwitchField,
  TextField,
} from './fields.js';

interface Props {
  mode: MemberFormMode;
  actor: TeamActor;
  /** Stations the actor may assign (already limited to a Manager's own). */
  stations: ReadonlyArray<{ id: string; name: string }>;
  initial: MemberFormValues;
  /** Edit: the member already has a login (contact details do not change how they sign in). */
  hasLogin?: boolean;
  /** Edit: it is the signed-in user, so the Role stays. */
  roleLocked?: boolean;
  save: (body: Record<string, unknown>) => Promise<TeamWriteResult<object | undefined>>;
  isSaving: boolean;
  onClose: () => void;
}

const IDENTITIES = ['Phone', 'Email'] as const;

/** Blank form values for a new member. */
export function newMemberDefaults(stationIds: string[]): MemberFormValues {
  return {
    fullName: '',
    phone: '',
    email: '',
    role: 'Staff',
    stationIds,
    enableAppAccess: true,
    identity: 'Phone',
    password: generatePassword(),
  };
}

const retryNote = (f: TeamFailure) =>
  f.unknownOutcome
    ? ' Your save may or may not have gone through. Try again: it will not be applied twice.'
    : '';

/**
 * The add / edit member form. The Role and Station pickers offer only what the
 * actor may set, and the same rules are enforced by the server. Mounted only
 * while its sheet is open, so it always starts from the member's current values.
 */
export const MemberForm: React.FC<Props> = ({
  mode,
  actor,
  stations,
  initial,
  hasLogin,
  roleLocked,
  save,
  isSaving,
  onClose,
}) => {
  const toast = useToast();
  const [refusal, setRefusal] = useState<TeamFailure | null>(null);
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);

  const roles = useMemo(
    () => (roleLocked ? [initial.role] : assignableRoles(actor.role)),
    [roleLocked, initial.role, actor.role],
  );
  const schema = useMemo(
    () =>
      memberFormSchema({
        mode,
        allowedRoles: roles,
        allowedStationIds: stations.map((s) => s.id),
        requireStation: actor.role === 'Manager',
      }),
    [mode, roles, stations, actor.role],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MemberFormValues>({ resolver: zodResolver(schema), defaultValues: initial });

  const values = watch();
  const clear = () => setRefusal(null);
  const set = <K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) => {
    clear();
    setValue(key, value as never, { shouldDirty: true, shouldValidate: false });
  };

  // A login has one identity, so the contact detail it does not use is cleared: left
  // behind it would be validated while hidden and block the save for no visible reason.
  const chooseIdentity = (identity: 'Phone' | 'Email') => {
    set('identity', identity);
    setValue(identity === 'Phone' ? 'email' : 'phone', '');
  };

  const create = mode === 'create';
  // Create with app access: one identity (what they sign in with). Otherwise both are plain contact details.
  const loginOnly = create && values.enableAppAccess;
  const showPhone = !loginOnly || values.identity === 'Phone';
  const showEmail = !loginOnly || values.identity === 'Email';

  const submit = handleSubmit(async (data) => {
    clear();
    const body = memberRequest(data, mode);
    const result = await save(body);
    if (!result.ok) {
      setRefusal(result.failure);
      return;
    }
    if (create && data.enableAppAccess) {
      setCredentials({
        login:
          loginIdentity({
            email: body.email as string | null,
            phone: body.phone as string | null,
          }) ?? '',
        password: data.password,
      });
      return;
    }
    toast.success(create ? 'Member added.' : 'Changes saved.');
    onClose();
  });

  if (credentials)
    return (
      <CredentialsCard
        title="Member added"
        name={values.fullName.trim()}
        login={credentials.login}
        password={credentials.password}
        onDone={onClose}
      />
    );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3.5 px-4">
      <h2 className="m-0 text-[15px] font-bold text-text-high">
        {create ? 'Add member' : 'Edit member'}
      </h2>

      <TextField
        label="Full name"
        autoComplete="off"
        autoCapitalize="words"
        error={errors.fullName?.message}
        {...register('fullName', { onChange: clear })}
      />

      <ChoiceChips
        label="Role"
        options={roles}
        value={values.role}
        onChange={(r) => set('role', r)}
        disabled={roleLocked}
        error={errors.role?.message}
        hint={
          roleLocked
            ? 'You cannot change your own role.'
            : actor.role === 'Manager'
              ? 'Managers can add Staff and Attendants.'
              : undefined
        }
      />

      {values.role === 'Owner' ? (
        <p className="m-0 text-[12px] text-text-muted">Owners can use every station.</p>
      ) : (
        <StationChecks
          label="Stations"
          stations={stations}
          value={values.stationIds}
          onChange={(ids) => set('stationIds', ids)}
          error={errors.stationIds?.message}
        />
      )}

      {create && (
        <SwitchField
          label="Mobile app access"
          hint="Creates a login so they can sign in on their phone."
          checked={values.enableAppAccess}
          onChange={(on) => {
            set('enableAppAccess', on);
            if (on) setValue(values.identity === 'Phone' ? 'email' : 'phone', '');
          }}
        />
      )}

      {loginOnly && (
        <ChoiceChips
          label="Sign in with"
          options={IDENTITIES}
          value={values.identity}
          onChange={chooseIdentity}
        />
      )}

      {showPhone && (
        <TextField
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="98765 43210"
          error={errors.phone?.message}
          {...register('phone', { onChange: clear })}
        />
      )}
      {showEmail && (
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          error={errors.email?.message}
          hint={!create && hasLogin ? 'Changing this does not change how they sign in.' : undefined}
          {...register('email', { onChange: clear })}
        />
      )}

      {loginOnly && (
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            error={errors.password?.message}
            hint="At least 8 characters. You will see it once after saving."
            {...register('password', { onChange: clear })}
          />
          <button
            type="button"
            onClick={() => set('password', generatePassword())}
            className="self-start rounded-lg px-1 py-1.5 text-[12.5px] font-bold text-accent"
          >
            Generate a new one
          </button>
        </div>
      )}

      {refusal && (
        <FormRefusal>
          {refusal.message}
          {retryNote(refusal)}
        </FormRefusal>
      )}

      <SheetButtons
        onCancel={onClose}
        submitLabel={create ? 'Add member' : 'Save changes'}
        busyLabel="Saving…"
        busy={isSaving}
      />
    </form>
  );
};
