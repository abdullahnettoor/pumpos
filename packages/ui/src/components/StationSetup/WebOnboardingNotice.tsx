import React, { useState } from 'react';
import { canOnboardStation, type Role } from '@pump/shared';
import { Globe, ExternalLink, Copy, Check, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '../../pump-ds/index.js';
import { openExternal } from '../../utils/platform.js';
import { useRunTask } from '../../utils/runTask.js';

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
  /** Typed as `Role`, not a widened string: the union collapsed to `string`,
   *  which meant this could not call the shared onboarding guard without a
   *  cast that would have defeated the point. */
  role: Role;
  userName?: string;
  /** Re-check whether the station has become ready (e.g. reload / refetch). */
  onRecheck?: () => void | Promise<unknown>;
  onSignOut?: () => void | Promise<unknown>;
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
  const runTask = useRunTask();
  const [copied, setCopied] = useState(false);
  const canOnboard = canOnboardStation(role);

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
    <div className="flex min-h-[100vh] items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[480px] animate-fade-in rounded-card border border-border-soft bg-surface p-7 text-center shadow-lg">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-info-bg text-info-fg">
          <Globe size={24} />
        </div>

        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink-strong">
          {canOnboard ? "Let's finish setting up on the web" : 'Station setup isn’t finished yet'}
        </h2>

        <p className="mt-2.5 text-[13px] leading-normal text-ink-muted">
          {canOnboard ? (
            <>
              First-time station setup — tanks, dispensers, products and staff — is done once in the
              PumpOS <strong className="text-ink-default">web console</strong>. As soon as it’s
              complete, this desktop app unlocks for daily operations.
            </>
          ) : (
            <>
              Your Owner or Manager needs to finish the station’s setup in the PumpOS
              <strong className="text-ink-default"> web console</strong>. This desktop app will
              unlock automatically once that’s done.
            </>
          )}
        </p>

        {/* Selectable console URL + copy (works even if in-app open is blocked) */}
        <div className="mt-[18px] flex items-center gap-2 rounded-input border border-border-soft bg-canvas py-2 pl-3 pr-2.5">
          <span className="flex-1 select-all truncate text-left font-mono text-[12.5px] text-ink-default">
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
        <div className="mt-[18px] flex gap-2">
          {canOnboard && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<ExternalLink size={13} />}
              onClick={() => openExternal(webUrl)}
              className="flex-1"
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
            className={canOnboard ? undefined : 'flex-1'}
          >
            {rechecking ? 'Checking…' : 'I’ve finished — check again'}
          </Button>
        </div>

        {/* Footer: identity + sign out */}
        <div className="mt-5 flex items-center justify-center gap-2 border-t border-border-soft pt-3.5 text-[12px] text-ink-muted">
          {userName && <span>Signed in as {userName}</span>}
          {userName && onSignOut && <span aria-hidden>·</span>}
          {onSignOut && (
            <Button
              variant="ghost"
              size="xs"
              leftIcon={<LogOut size={12} />}
              className="text-ink-muted"
              onClick={() => runTask(onSignOut?.(), 'Could not sign out.')}
            >
              Sign out
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
