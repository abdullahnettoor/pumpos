/**
 * Provision a fuel-station owner and bootstrap their organization —
 * `owners invite`, both modes.
 */
import React, { useState } from 'react';
import { Banner, Button, Checkbox, Drawer, Field, TextInput } from '@pump/ui';
import { commands, useInvalidatePlatform } from '../api/queries.js';
import type { ApiTarget } from '../api/targets.js';
import type { InviteResult } from '../api/types.js';

export interface InviteOwnerDrawerProps {
  target: ApiTarget;
  onClose: () => void;
}

export const InviteOwnerDrawer: React.FC<InviteOwnerDrawerProps> = ({ target, onClose }) => {
  const invalidate = useInvalidatePlatform(target);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [noEmail, setNoEmail] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Held in component state rather than a toast: the password is returned once
  // and never again, so it must not be dismissible by a timer or a re-render.
  const [result, setResult] = useState<InviteResult | null>(null);

  const submit = async () => {
    setError(null);
    try {
      const data = await commands.invite(target, {
        email,
        fullName,
        organizationName,
        noEmail,
        password: password.trim() || undefined,
      });
      setResult(data);
      invalidate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not provision the owner.');
    }
  };

  if (result) {
    return (
      <Drawer isOpen onClose={onClose} title="Owner provisioned">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {result.password ? (
            <>
              <Banner severity="warning" title="Shown once">
                No invite email was sent. Copy these credentials now — the password cannot be
                retrieved again.
              </Banner>
              <Handover
                rows={[
                  ['Organization', organizationName],
                  ['Name', fullName],
                  ['Login', result.email],
                  ['Password', result.password],
                  ['Auth user id', result.authUserId],
                ]}
              />
            </>
          ) : (
            <Banner severity="success" title="Invite sent">
              {result.email} will set their own password through the invite link.
            </Banner>
          )}
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Invite owner"
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button onClick={submit}>{noEmail ? 'Provision owner' : 'Send invite'}</Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Organization" required>
          <TextInput
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="Jane Fuels"
          />
        </Field>
        <Field label="Owner name" required>
          <TextInput
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane"
          />
        </Field>
        <Field label="Owner email" required>
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </Field>

        <Checkbox
          checked={noEmail}
          onChange={(e) => setNoEmail(e.target.checked)}
          label="Provision without email"
          description="For when delivery is unavailable: creates a verified account and returns a password to hand over."
        />
        {noEmail && (
          <Field label="Password" hint="Leave empty to have a strong one generated.">
            <TextInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="(generated)"
            />
          </Field>
        )}

        {error && <Banner severity="danger">{error}</Banner>}
      </div>
    </Drawer>
  );
};

const Handover: React.FC<{ rows: [string, string][] }> = ({ rows }) => (
  <div
    style={{
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-card)',
      padding: 'var(--space-4)',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: 'var(--space-2) var(--space-4)',
      fontSize: '13px',
    }}
  >
    {rows.map(([label, value]) => (
      <React.Fragment key={label}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <code style={{ userSelect: 'all', wordBreak: 'break-all' }}>{value}</code>
      </React.Fragment>
    ))}
  </div>
);
