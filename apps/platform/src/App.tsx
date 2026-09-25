import React, { useEffect, useState } from 'react';
import { Button } from '@pump/ui';
import { getSession, signOut, subscribeToSession, type PlatformSession } from './api/client.js';
import { API_TARGETS, loadStoredTarget, storeTarget, type ApiTarget } from './api/targets.js';
import { OrganizationsScreen } from './screens/OrganizationsScreen.js';
import { SignIn } from './screens/SignIn.js';

export default function App() {
  const [target, setTarget] = useState<ApiTarget>(loadStoredTarget);
  const [session, setSession] = useState<PlatformSession | null>(getSession);

  useEffect(() => subscribeToSession(setSession), []);

  const changeTarget = (next: ApiTarget) => {
    setTarget(next);
    storeTarget(next);
    // A JWT is valid across targets (one Supabase project), but the data is
    // not: switching environments mid-session must not leave the previous
    // one's rows on screen under the new label.
    if (getSession()) signOut();
  };

  if (!session) return <SignIn target={target} onTargetChange={changeTarget} />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-app)' }}>
      <TargetBar target={target} session={session} onTargetChange={changeTarget} />
      <div style={{ padding: 'var(--space-6)' }}>
        <OrganizationsScreen target={target} />
      </div>
    </div>
  );
}

/**
 * Which API every button on this page is aimed at, and who is aimed at it.
 *
 * Permanently visible and loud on production: this app's actions suspend live
 * organizations, and "which environment am I in?" must never be a guess.
 */
const TargetBar: React.FC<{
  target: ApiTarget;
  session: PlatformSession;
  onTargetChange: (target: ApiTarget) => void;
}> = ({ target, session, onTargetChange }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)',
      padding: 'var(--space-2) var(--space-6)',
      borderBottom: '1px solid var(--border-strong)',
      backgroundColor: target.production ? 'var(--state-danger-bg)' : 'var(--bg-surface-alt)',
      fontSize: '12px',
    }}
  >
    <strong style={{ color: target.production ? 'var(--state-danger-fg)' : 'var(--text-strong)' }}>
      {target.production ? 'PRODUCTION' : target.label.toUpperCase()}
    </strong>
    <code style={{ color: 'var(--text-muted)' }}>{target.url}</code>
    <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
      {API_TARGETS.filter((option) => option.id !== target.id).map((option) => (
        <Button
          key={option.id}
          size="xs"
          variant="secondary"
          onClick={() => onTargetChange(option)}
        >
          Switch to {option.label}
        </Button>
      ))}
      <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>{session.email}</span>
      <Button size="xs" variant="ghost" onClick={signOut}>
        Sign out
      </Button>
    </div>
  </div>
);
