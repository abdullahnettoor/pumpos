import React from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field, TextInput } from '../primitives/Field.js';
import type { ToastApi } from '../primitives/ToastProvider.js';
import { Button, Icon, SegmentedControl } from '../../pump-ds/index.js';

/**
 * The parts of a login the Team drawers share: the credentials to hand over,
 * the password helpers, and the identity + password fields that create a login
 * (a new member with app access, and app access for an existing member).
 */

/** The credentials could not reach the clipboard (#606: say what to do next). */
const COPY_FAILED = 'Copy failed. Select the text and copy it, or note it down.';

export interface Credentials {
  login: string;
  password: string;
}

// --- helpers ---------------------------------------------------------------
export function generatePassword(): string {
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
export function copyWithFeedback(text: string, label: string, toast: ToastApi): void {
  copyText(text)
    .then((ok) => (ok ? toast.success(`${label} copied.`) : toast.error(COPY_FAILED)))
    .catch(() => toast.error(COPY_FAILED));
}

/** A password input with Generate and Copy beside it. */
export const PasswordRow: React.FC<{
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

export type LoginIdentityType = 'Email' | 'Phone';

/** The identity picker (phone or email) and password, for provisioning a login. */
export const LoginIdentityFields: React.FC<{
  identityType: LoginIdentityType;
  onIdentityTypeChange: (type: LoginIdentityType) => void;
  email: UseFormRegisterReturn;
  phone: UseFormRegisterReturn;
  password: UseFormRegisterReturn;
  emailError?: string;
  phoneError?: string;
  passwordError?: string;
  passwordValue: string;
  onGeneratePassword: () => void;
  toast: ToastApi;
}> = ({
  identityType,
  onIdentityTypeChange,
  email,
  phone,
  password,
  emailError,
  phoneError,
  passwordError,
  passwordValue,
  onGeneratePassword,
  toast,
}) => (
  <>
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
        onChange={onIdentityTypeChange}
      />
    </div>

    {identityType === 'Email' ? (
      <Field label="Email address" required error={emailError}>
        <TextInput
          type="email"
          placeholder="e.g. john@station.com"
          invalid={!!emailError}
          {...email}
        />
      </Field>
    ) : (
      <Field
        label="Phone number"
        required
        error={phoneError}
        hint="They sign in with this phone number + password. No SMS is sent."
      >
        <TextInput
          type="tel"
          placeholder="e.g. 98765 43210"
          invalid={!!phoneError}
          aria-invalid={!!phoneError}
          {...phone}
        />
      </Field>
    )}

    <Field label="Password" required error={passwordError}>
      <PasswordRow
        input={
          <TextInput
            type="text"
            className="font-mono"
            placeholder="At least 8 characters"
            {...password}
          />
        }
        onGenerate={onGeneratePassword}
        onCopy={() => copyWithFeedback(passwordValue, 'Password', toast)}
        canCopy={!!passwordValue}
      />
    </Field>
  </>
);

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

export const CredentialsCard: React.FC<{
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
