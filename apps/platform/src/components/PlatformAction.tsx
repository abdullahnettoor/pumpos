import React, { useState } from 'react';
import { Button, Field, Textarea, useToast } from '@pump/ui';

export type ReasonRequirement = 'required' | 'optional' | 'none';

export interface PlatformActionProps {
  label: string;
  /** Name of the organization being acted on. Always shown before confirming. */
  organizationName: string;
  /** One line on what the action does, in the operator's terms. */
  description: string;
  reason?: ReasonRequirement;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Why the action is unavailable, shown in place of the button when disabled. */
  disabledHint?: string;
  /**
   * Performs the command. The string it resolves with is toasted, so a handler
   * can report "no change — already in effect" rather than claiming success.
   */
  onConfirm: (reason: string | undefined) => Promise<string>;
}

/**
 * Every mutating control in this app. One pattern, no exceptions: arm, read the
 * organization name and what is about to happen, supply a reason where the API
 * wants one, then commit.
 *
 * The confirm step is not ceremony. The CLI these actions replace took an
 * organization UUID, so the operator's last sight before suspending a live
 * station network was a pasted identifier. Here it is the name.
 */
export const PlatformAction: React.FC<PlatformActionProps> = ({
  label,
  organizationName,
  description,
  reason = 'optional',
  variant = 'secondary',
  disabled,
  disabledHint,
  onConfirm,
}) => {
  const toast = useToast();
  const [armed, setArmed] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setArmed(false);
    setReasonText('');
    setError(null);
  };

  const commit = async () => {
    const trimmed = reasonText.trim();
    if (reason === 'required' && !trimmed) {
      setError('A reason is required for this action.');
      return;
    }
    setError(null);
    try {
      const message = await onConfirm(trimmed || undefined);
      toast.success(message);
      close();
    } catch (err: unknown) {
      // Kept inline rather than toasted: the operator is mid-decision, and the
      // refusal usually names the action they should take instead.
      setError(err instanceof Error ? err.message : 'The action failed.');
    }
  };

  if (disabled) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Button size="sm" variant={variant} disabled>
          {label}
        </Button>
        {disabledHint && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{disabledHint}</span>
        )}
      </div>
    );
  }

  if (!armed) {
    // Wrapped so the button keeps its natural width inside the drawer's
    // stretching column layout.
    return (
      <div>
        <Button size="sm" variant={variant} onClick={() => setArmed(true)}>
          {label}
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        backgroundColor: 'var(--bg-surface-alt)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ fontSize: '13px', color: 'var(--text-strong)' }}>
        <strong>{label}</strong> — {organizationName}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{description}</div>

      {reason !== 'none' && (
        <Field
          label="Reason"
          required={reason === 'required'}
          hint={reason === 'optional' ? 'Optional. Recorded on the audit event.' : undefined}
        >
          <Textarea
            rows={2}
            autoFocus
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Why this is being done"
          />
        </Field>
      )}

      {error && <div style={{ fontSize: '12px', color: 'var(--state-danger-fg)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button size="sm" variant={variant === 'danger' ? 'danger' : 'primary'} onClick={commit}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
