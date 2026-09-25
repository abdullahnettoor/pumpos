import React, { useState } from 'react';
import { Banner, Button, Field, TextInput } from '@pump/ui';
import { signIn } from '../api/client.js';
import { API_TARGETS, type ApiTarget } from '../api/targets.js';

export interface SignInProps {
  target: ApiTarget;
  onTargetChange: (target: ApiTarget) => void;
}

/**
 * Sign in as a platform admin.
 *
 * The target is chosen here, before the session exists, so the environment is
 * settled before any command can be issued against the wrong one.
 */
export const SignIn: React.FC<SignInProps> = ({ target, onTargetChange }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    void signIn(email, password).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-app)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          padding: 'var(--space-6)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-card)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '18px' }}>PumpOS platform admin</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Local back-office. Your email must be in the API's PLATFORM_ADMIN_EMAILS allow-list.
          </p>
        </div>

        <Field label="Environment">
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {API_TARGETS.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={option.id === target.id ? 'primary' : 'secondary'}
                onClick={() => onTargetChange(option)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Field>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          <code>{target.url}</code>
        </div>

        <Field label="Email" required>
          <TextInput
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" required>
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <Banner severity="danger">{error}</Banner>}

        <Button type="submit">Sign in</Button>
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
          The session is held in memory only — reloading signs you out.
        </p>
      </form>
    </div>
  );
};
