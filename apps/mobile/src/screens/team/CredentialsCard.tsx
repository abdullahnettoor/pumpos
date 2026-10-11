import React from 'react';
import { useToast } from '@pump/ui';

interface Props {
  title: string;
  /** Who the credentials are for. */
  name: string;
  /** What they sign in with (phone or email). */
  login: string;
  password: string;
  onDone: () => void;
}

/**
 * Shown once after a login is created or a password is reset: the password is
 * the one thing that cannot be read again, so it is handed over here.
 */
export const CredentialsCard: React.FC<Props> = ({ title, name, login, password, onDone }) => {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Login: ${login}\nPassword: ${password}`);
      toast.success('Credentials copied.');
    } catch {
      toast.error('Copy failed. Note the password down before you close this.');
    }
  };
  return (
    <div className="flex flex-col gap-3 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">{title}</h2>
        <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{name}</p>
      </div>
      <dl className="m-0 overflow-hidden rounded-[14px] border border-line bg-card [&>div+div]:border-t [&>div+div]:border-line">
        <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
          <dt className="text-[12px] text-text-muted">Sign in with</dt>
          <dd className="num m-0 min-w-0 truncate text-[13.5px] font-semibold text-text-high">
            {login}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
          <dt className="text-[12px] text-text-muted">Password</dt>
          <dd className="num m-0 text-[13.5px] font-semibold text-text-high">{password}</dd>
        </div>
      </dl>
      <p className="m-0 text-[11.5px] text-text-muted">
        Share these now: the password cannot be shown again. They can change it after signing in.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => void copy()}
          className="flex h-11 items-center justify-center rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex h-11 items-center justify-center rounded-[13px] bg-accent text-[13.5px] font-bold text-on-accent"
        >
          Done
        </button>
      </div>
    </div>
  );
};
