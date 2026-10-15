import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { Button, Form, Icon } from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { Field, TextInput } from '../primitives/Field.js';
import { AuthScreen } from './AuthScreen.js';

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

export interface AcceptInviteProps {
  /** Called after the password is set successfully (host typically reloads). */
  onDone?: () => void;
}

/** Best-effort mobile detection so we don't bounce a fresh owner into the
 *  mobile app (where onboarding — which is desktop-only — can't be done). */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as any).userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i.test(
    navigator.userAgent || '',
  );
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
  const [copied, setCopied] = useState(false);
  const onMobile = isMobileDevice();
  const desktopUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://console.pumpos.app';

  useEffect(() => {
    let cancelled = false;
    // The client parses the invite/recovery token from the URL on load. Give it
    // a moment to establish the session, then reflect whether we have one.
    const resolve = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setHasSession(!!data.session);
        setEmail(data.session?.user?.email ?? null);
      } catch (err: unknown) {
        // Without this, a rejected getSession skipped setReady(true) and the
        // invite screen hung on its loading state. Fall through to "no
        // session", which renders the actionable error instead.
        console.error('Failed to read invite session:', err);
        if (cancelled) return;
        setHasSession(false);
        setEmail(null);
      } finally {
        // In a `finally`, not after the try: an unexpected throw anywhere above
        // must still leave the screen interactive rather than parked on
        // "Verifying your invite…" with nothing to click.
        if (!cancelled) setReady(true);
      }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setHasSession(!!session);
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });
    void resolve();
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

  const openApp = () => (onDone ? onDone() : window.location.assign('/'));
  const copyDesktopUrl = () => {
    navigator.clipboard
      .writeText(desktopUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        /* clipboard blocked — URL is shown as selectable text */
      });
  };

  return (
    <AuthScreen
      title={done ? 'Password set' : 'Set your password'}
      subtitle={email && !done ? email : undefined}
    >
      {errorMsg && <Banner severity="danger">{errorMsg}</Banner>}

      {!ready ? (
        <p className="text-center text-[13px] text-ink-muted">Verifying your invite…</p>
      ) : done ? (
        <div className="flex flex-col gap-3.5">
          {onMobile ? (
            <>
              <p className="text-[13px] leading-normal text-ink-muted">
                Your password is set. To finish setting up your station, open PumpOS on a desktop or
                laptop — station onboarding isn't available on mobile.
              </p>
              <div className="flex items-center justify-between gap-2 break-all rounded-input border border-border-strong bg-surface-alt px-3 py-2.5 font-mono text-[12px] text-ink-strong">
                <span>{desktopUrl}</span>
                <Button variant="secondary" size="xs" className="shrink-0" onClick={copyDesktopUrl}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Button variant="secondary" fullWidth onClick={openApp}>
                Open the app anyway
              </Button>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-normal text-ink-muted">
                Your password is set. Continue to PumpOS — if setup for your station isn't finished
                yet, you'll be guided to complete it on the desktop app.
              </p>
              <Button fullWidth onClick={openApp} rightIcon={<Icon name="arrow-right" size="xs" />}>
                Continue
              </Button>
            </>
          )}
        </div>
      ) : !hasSession ? (
        <div className="flex flex-col gap-3.5">
          <p className="text-[13px] leading-normal text-ink-muted">
            This invite link is invalid or has expired. Ask your administrator to send a new invite,
            or sign in if you already set a password.
          </p>
          <Button variant="secondary" fullWidth onClick={() => window.location.assign('/')}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <Form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <Field label="New password" htmlFor="invite-password">
            <TextInput
              id="invite-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
              autoFocus
            />
          </Field>
          <Field label="Confirm password" htmlFor="invite-confirm">
            <TextInput
              id="invite-confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              disabled={loading}
            />
          </Field>
          <Button
            type="submit"
            fullWidth
            disabled={loading}
            className="mt-2"
            rightIcon={loading ? undefined : <Icon name="arrow-right" size="xs" />}
          >
            {loading ? 'Saving…' : 'Set password & continue'}
          </Button>
        </Form>
      )}
    </AuthScreen>
  );
};
