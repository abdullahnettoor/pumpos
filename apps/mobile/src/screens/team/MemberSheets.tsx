import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@pump/ui';
import {
  appAccessFormSchema,
  appAccessRequest,
  generatePassword,
  resetPasswordSchema,
  type AppAccessFormValues,
  type MemberFormValues,
  type ResetPasswordValues,
} from '../../lib/team/form.js';
import type { TeamFailure } from '../../lib/team/failure.js';
import { loginIdentity, type TeamMember } from '../../lib/team/members.js';
import type { TeamActor } from '../../lib/team/permissions.js';
import { BottomSheet } from '../../ui/BottomSheet.js';
import { CredentialsCard } from './CredentialsCard.js';
import { SheetButtons } from '../../ui/SheetButtons.js';
import { ChoiceChips, FormRefusal, TextField } from './fields.js';
import { MemberForm, newMemberDefaults } from './MemberForm.js';
import {
  useAddMember,
  useGrantAppAccess,
  useResetPassword,
  useSetMemberActive,
  useUpdateMember,
} from './useTeamWrite.js';

type Station = { id: string; name: string };

const unconfirmed = (f: TeamFailure) =>
  f.unknownOutcome
    ? ' This may or may not have gone through. Try again: it will not be applied twice.'
    : '';

/**
 * Add a member. The write hook (and so the Idempotency-Key) lives here, not in
 * the form: the form mounts only while the sheet is open, and a retry after a
 * network error must reuse the same key even if the sheet was closed and reopened.
 */
export const AddMemberSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  actor: TeamActor;
  /** Stations the actor may assign. */
  stations: Station[];
  /** The station the person is working in: pre-checked for the new member. */
  currentStationId?: string | null;
}> = ({ open, onClose, actor, stations, currentStationId }) => {
  const { save, isSaving } = useAddMember();
  const preselected =
    currentStationId && stations.some((s) => s.id === currentStationId)
      ? [currentStationId]
      : stations.length === 1
        ? [stations[0].id]
        : [];
  return (
    <BottomSheet open={open} onClose={onClose} label="Add member">
      <MemberForm
        mode="create"
        actor={actor}
        stations={stations}
        initial={newMemberDefaults(preselected)}
        save={save}
        isSaving={isSaving}
        onClose={onClose}
      />
    </BottomSheet>
  );
};

/** Edit a member's details, Role and stations. */
export const EditMemberSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  member: TeamMember;
  actor: TeamActor;
  stations: Station[];
  roleLocked: boolean;
}> = ({ open, onClose, member, actor, stations, roleLocked }) => {
  const { save, isSaving } = useUpdateMember(member.id);
  const initial: MemberFormValues = {
    fullName: member.fullName,
    phone: member.phone ?? '',
    email: member.email ?? '',
    role: member.role,
    stationIds: member.stationIds ?? [],
    enableAppAccess: false,
    identity: 'Phone',
    password: '',
  };
  return (
    <BottomSheet open={open} onClose={onClose} label="Edit member">
      <MemberForm
        mode="edit"
        actor={actor}
        stations={stations}
        initial={initial}
        hasLogin={member.hasLogin}
        member={{ id: member.id, role: member.role }}
        roleLocked={roleLocked}
        save={save}
        isSaving={isSaving}
        onClose={onClose}
      />
    </BottomSheet>
  );
};

const ResetForm: React.FC<{
  member: TeamMember;
  save: ReturnType<typeof useResetPassword>['save'];
  isSaving: boolean;
  onClose: () => void;
}> = ({ member, save, isSaving, onClose }) => {
  const [refusal, setRefusal] = useState<TeamFailure | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: generatePassword() },
  });

  const submit = handleSubmit(async ({ password }) => {
    setRefusal(null);
    const result = await save(password);
    if (result.ok) setDone(password);
    else setRefusal(result.failure);
  });

  if (done)
    return (
      <CredentialsCard
        title="Password reset"
        name={member.fullName}
        login={loginIdentity(member) ?? ''}
        password={done}
        onDone={onClose}
      />
    );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3.5 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">Reset password</h2>
        <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{member.fullName}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <TextField
          label="New password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.password?.message}
          hint="At least 8 characters. You will see it once after saving."
          {...register('password', { onChange: () => setRefusal(null) })}
        />
        <button
          type="button"
          onClick={() => setValue('password', generatePassword())}
          className="self-start rounded-lg px-1 py-1.5 text-[12.5px] font-bold text-accent"
        >
          Generate a new one
        </button>
      </div>
      {refusal && (
        <FormRefusal>
          {refusal.message}
          {unconfirmed(refusal)}
        </FormRefusal>
      )}
      <SheetButtons
        onCancel={onClose}
        submitLabel="Reset password"
        busyLabel="Resetting…"
        busy={isSaving}
      />
    </form>
  );
};

/** Set a new password for a member who has a login. */
export const ResetPasswordSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  member: TeamMember;
}> = ({ open, onClose, member }) => {
  const { save, isSaving } = useResetPassword(member.id);
  return (
    <BottomSheet open={open} onClose={onClose} label="Reset password">
      <ResetForm member={member} save={save} isSaving={isSaving} onClose={onClose} />
    </BottomSheet>
  );
};

const IDENTITIES = ['Phone', 'Email'] as const;

const GiveAccessForm: React.FC<{
  member: TeamMember;
  save: ReturnType<typeof useGrantAppAccess>['save'];
  isSaving: boolean;
  onClose: () => void;
}> = ({ member, save, isSaving, onClose }) => {
  const [refusal, setRefusal] = useState<TeamFailure | null>(null);
  const [done, setDone] = useState<{ login: string; password: string } | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AppAccessFormValues>({
    resolver: zodResolver(appAccessFormSchema),
    defaultValues: {
      identity: member.phone || !member.email ? 'Phone' : 'Email',
      phone: member.phone ?? '',
      email: member.email ?? '',
      password: generatePassword(),
    },
  });
  const identity = watch('identity');
  const clear = () => setRefusal(null);

  const submit = handleSubmit(async (data) => {
    setRefusal(null);
    const body = appAccessRequest(data);
    const result = await save(body);
    if (result.ok)
      setDone({
        login: (body.phone ?? body.email ?? '') as string,
        password: data.password,
      });
    else setRefusal(result.failure);
  });

  if (done)
    return (
      <CredentialsCard
        title="App access given"
        name={member.fullName}
        login={done.login}
        password={done.password}
        onDone={onClose}
      />
    );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3.5 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">Give app access</h2>
        <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{member.fullName}</p>
      </div>
      <ChoiceChips
        label="Sign in with"
        options={IDENTITIES}
        value={identity}
        onChange={(next) => {
          clear();
          setValue('identity', next);
        }}
      />
      {identity === 'Phone' ? (
        <TextField
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="98765 43210"
          error={errors.phone?.message}
          {...register('phone', { onChange: clear })}
        />
      ) : (
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          error={errors.email?.message}
          {...register('email', { onChange: clear })}
        />
      )}
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
          onClick={() => setValue('password', generatePassword())}
          className="self-start rounded-lg px-1 py-1.5 text-[12.5px] font-bold text-accent"
        >
          Generate a new one
        </button>
      </div>
      {refusal && (
        <FormRefusal>
          {refusal.message}
          {unconfirmed(refusal)}
        </FormRefusal>
      )}
      <SheetButtons
        onCancel={onClose}
        submitLabel="Give app access"
        busyLabel="Saving…"
        busy={isSaving}
      />
    </form>
  );
};

/**
 * Give a member without a login one (#462). The write hook (and so the
 * Idempotency-Key) lives here, like the other sheets, so a retry after a
 * network error reuses the key even if the sheet was closed and reopened.
 */
export const GiveAppAccessSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  member: TeamMember;
}> = ({ open, onClose, member }) => {
  const { save, isSaving } = useGrantAppAccess(member.id);
  return (
    <BottomSheet open={open} onClose={onClose} label="Give app access">
      <GiveAccessForm member={member} save={save} isSaving={isSaving} onClose={onClose} />
    </BottomSheet>
  );
};

const StatusForm: React.FC<{
  member: TeamMember;
  active: boolean;
  save: ReturnType<typeof useSetMemberActive>['save'];
  isSaving: boolean;
  onClose: () => void;
}> = ({ member, active, save, isSaving, onClose }) => {
  const toast = useToast();
  const [refusal, setRefusal] = useState<TeamFailure | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefusal(null);
    const result = await save();
    if (result.ok) {
      toast.success(active ? 'Member reactivated.' : 'Member deactivated.');
      onClose();
    } else setRefusal(result.failure);
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3.5 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">
          {active ? 'Reactivate member' : 'Deactivate member'}
        </h2>
        <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{member.fullName}</p>
      </div>
      <p className="m-0 text-[13px] text-text-default">
        {active
          ? `${member.fullName} will be able to sign in and work again.`
          : member.hasLogin
            ? `${member.fullName} will no longer be able to sign in. Their past work stays on record, and you can reactivate them later.`
            : `${member.fullName} will be marked inactive. Their past work stays on record, and you can reactivate them later.`}
      </p>
      {refusal && (
        <FormRefusal>
          {refusal.message}
          {unconfirmed(refusal)}
        </FormRefusal>
      )}
      <SheetButtons
        onCancel={onClose}
        submitLabel={active ? 'Reactivate' : 'Deactivate'}
        busyLabel="Saving…"
        busy={isSaving}
        tone={active ? 'accent' : 'danger'}
      />
    </form>
  );
};

/** Confirm deactivating or reactivating a member. `active` is what the member becomes. */
export const StatusSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  member: TeamMember;
  active: boolean;
}> = ({ open, onClose, member, active }) => {
  const { save, isSaving } = useSetMemberActive(member.id, active);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      label={active ? 'Reactivate member' : 'Deactivate member'}
    >
      <StatusForm
        member={member}
        active={active}
        save={() => save()}
        isSaving={isSaving}
        onClose={onClose}
      />
    </BottomSheet>
  );
};
