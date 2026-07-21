import React, { useState } from 'react';
import { Globe, ExternalLink, Copy, Check, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '../../pump-ds/index.js';
import { openExternal } from '../../utils/platform.js';

/**
 * WebOnboardingNotice — the desktop app's first-run gate when a station has not
 * been onboarded yet. PumpOS does station onboarding **on the web console only**
 * (reliable browser storage, always-online, one place to update), so the desktop
 * app never shows the wizard; it directs the user to finish setup in the browser
 * and unlocks automatically once the station is ready.
 *
 * Presentational + platform-agnostic: the host passes the console URL and the
 * recheck/sign-out handlers. Copy is role-aware — owners/managers get the
 * "go set it up" call to action; staff/accountants get a "waiting on setup"
 * message (they can't onboard).
 */
export interface WebOnboardingNoticeProps {
  /** Public web console URL, e.g. https://console.pumpos.app */
  webUrl: string;
  role: 'Owner' | 'Manager' | 'Accountant' | 'Staff' | string;
  userName?: string;
  /** Re-check whether the station has become ready (e.g. reload / refetch). */
  onRecheck?: () => void;
  onSignOut?: () => void;
  rechecking?: boolean;
}

export const WebOnboardingNotice: React.FC<WebOnboardingNoticeProps> = ({
  webUrl,
  role,
  userName,
  onRecheck,
  onSignOut,
  rechecking = false,
}) => {
  const [copied, setCopied] = useState(false);
  const canOnboard = role === 'Owner' || role === 'Manager';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(webUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the URL is shown as selectable text below */
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        backgroundColor: 'var(--bg-canvas)',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-card)',
          padding: '28px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(24,32,26,0.08)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 16px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--info-bg, #EAF2FF)',
            color: 'var(--info-fg, #1F6A53)',
          }}
        >
          <Globe size={24} />
        </div>

        <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
          {canOnboard ? "Let's finish setting up on the web" : 'Station setup isn’t finished yet'}
        </h2>

        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, marginTop: '10px' }}>
          {canOnboard ? (
            <>
              First-time station setup — tanks, dispensers, products and staff — is done once in the
              PumpOS <strong style={{ color: 'var(--text-default)' }}>web console</strong>. As soon as it’s
              complete, this desktop app unlocks for daily operations.
            </>
          ) : (
            <>
              Your Owner or Manager needs to finish the station’s setup in the PumpOS
              <strong style={{ color: 'var(--text-default)' }}> web console</strong>. This desktop app will
              unlock automatically once that’s done.
            </>
          )}
        </p>

        {/* Selectable console URL + copy (works even if in-app open is blocked) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '18px',
            padding: '8px 10px 8px 12px',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-input)',
            backgroundColor: 'var(--bg-canvas)',
          }}
        >
          <span
            style={{
              flex: 1,
              textAlign: 'left',
              fontFamily: 'var(--font-mono)',
              fontSize: '12.5px',
              color: 'var(--text-default)',
              userSelect: 'all',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {webUrl.replace(/^https?:\/\//, '')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={copyLink}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
          {canOnboard && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<ExternalLink size={13} />}
              onClick={() => openExternal(webUrl)}
              style={{ flex: 1 }}
            >
              Open web console
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={13} />}
            onClick={onRecheck}
            loading={rechecking}
            style={{ flex: canOnboard ? undefined : 1 }}
          >
            {rechecking ? 'Checking…' : 'I’ve finished — check again'}
          </Button>
        </div>

        {/* Footer: identity + sign out */}
        <div
          style={{
            marginTop: '20px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          {userName && <span>Signed in as {userName}</span>}
          {userName && onSignOut && <span aria-hidden>·</span>}
          {onSignOut && (
            <button
              onClick={onSignOut}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '12px',
              }}
            >
              <LogOut size={12} /> Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
