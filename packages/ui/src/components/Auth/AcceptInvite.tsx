import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase.js';

/**
 * AcceptInvite — the landing page for a Supabase invite / recovery link.
 *
 * The invite email (Resend-backed) points here via `INVITE_REDIRECT_URL`
 * (e.g. `https://console.pumpos.app/accept-invite`). The Supabase client
 * auto-detects the token in the URL (`detectSessionInUrl`) and establishes a
 * short-lived session, which lets the recipient set their own password with
 * `supabase.auth.updateUser({ password })` — no admin involvement.
 *
 * Responsive by design so the same link works from a phone or desktop browser.
 * After the password is set, the caller reloads the app; the normal session
 * bootstrap then routes the user (Owner/Manager with no ready station land in
 * the Organization hub / desktop notice; everyone else proceeds to the app).
 */

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: 600,
  color: 'var(--text-muted)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  padding: '0 12px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-input)',
  fontSize: '13px',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-strong)',
  outline: 'none',
  boxSizing: 'border-box',
};

export interface AcceptInviteProps {
  /** Called after the password is set successfully (host typically reloads). */
  onDone?: () => void;
}

export const AcceptInvite: React.FC<AcceptInviteProps> = ({ onDone }) => {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The client parses the invite/recovery token from the URL on load. Give it
    // a moment to establish the session, then reflect whether we have one.
    const resolve = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data.session);
      setEmail(data.session?.user?.email ?? null);
      setReady(true);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setHasSession(!!session);
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });
    resolve();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not set password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-card)',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: 'var(--shadow-1)',
        }}
        className="animate-fade-in"
      >
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: '-0.01em' }}>
            PumpOS
          </span>
          <h1 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginTop: '8px' }}>
            {done ? 'Password set' : 'Set your password'}
          </h1>
          {email && !done && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{email}</p>
          )}
        </div>

        {errorMsg && (
          <div
            style={{
              backgroundColor: 'var(--state-danger-bg)',
              border: '1px solid var(--border-soft)',
              color: 'var(--state-danger-fg)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-input)',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {!ready ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>Verifying your invite…</p>
        ) : done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Your password is set. Continue to PumpOS — if setup for your station isn't finished yet, you'll be
              guided to complete it on the desktop app.
            </p>
            <button
              type="button"
              onClick={() => (onDone ? onDone() : window.location.assign('/'))}
              style={{
                height: '36px',
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Continue ➜
            </button>
          </div>
        ) : !hasSession ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This invite link is invalid or has expired. Ask your administrator to send a new invite, or sign in if
              you already set a password.
            </p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              style={{
                height: '36px',
                backgroundColor: 'transparent',
                color: 'var(--text-default)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label" style={labelStyle}>
                New password
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
                autoFocus
                style={inputStyle}
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={labelStyle}>
                Confirm password
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                disabled={loading}
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                height: '36px',
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: '8px',
                width: '100%',
              }}
            >
              {loading ? 'Saving…' : 'Set password & continue ➜'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
