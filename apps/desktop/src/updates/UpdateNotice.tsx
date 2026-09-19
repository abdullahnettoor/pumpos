import React from 'react';
import { Button } from '@pump/ui';
import type { DesktopUpdates } from './useDesktopUpdates.js';
import type { UpdateState } from './types.js';

/**
 * The operator-facing surface for desktop updates.
 *
 * Deliberately a compact notice pinned to the bottom of the shell, not a
 * startup modal: an update is never more important than the shift in front of
 * the operator, so it must be dismissible, ignorable, and incapable of blocking
 * navigation or data entry. Every transition past "an update exists" needs an
 * explicit click.
 *
 * Accessibility: the notice is a `status` live region so screen readers hear
 * checks, progress, failures and blocked restarts without focus being stolen;
 * every action is an ordinary button in DOM order.
 */
export const UpdateNotice: React.FC<{ updates: DesktopUpdates }> = ({ updates }) => {
  const { state } = updates;
  if (!updates.enabled || !state) return null;
  const view = describeUpdateState(state, updates);
  if (!view) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Desktop update"
      className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-card border border-border-strong bg-surface p-3 shadow-lg font-sans text-[13px] text-ink-default"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink-strong">{view.title}</p>
        {view.onDismiss ? (
          <Button size="xs" variant="ghost" onClick={view.onDismiss}>
            {view.dismissLabel}
          </Button>
        ) : null}
      </div>

      {view.detail ? <p className="mt-1 text-ink-muted">{view.detail}</p> : null}

      {/* Release notes are plain text from an external manifest: rendered as a
          text node, never as markup. */}
      {view.notes ? (
        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-input bg-surface-alt p-2 font-sans text-[12px] text-ink-muted">
          {view.notes}
        </pre>
      ) : null}

      {view.progress ? (
        <progress
          className="mt-2 w-full"
          aria-label="Update download progress"
          {...(view.progress.totalBytes
            ? { value: view.progress.downloadedBytes, max: view.progress.totalBytes }
            : {})}
        />
      ) : null}

      {view.actions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {view.actions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant ?? 'secondary'}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

interface NoticeAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

interface NoticeView {
  title: string;
  detail?: string;
  notes?: string;
  progress?: { downloadedBytes: number; totalBytes: number | null };
  actions: NoticeAction[];
  onDismiss?: () => void;
  dismissLabel: string;
}

/**
 * The whole notice is a pure projection of one coordinator state, which is why
 * this function is exported: the copy an operator reads in each state is
 * testable without rendering anything.
 */
export function describeUpdateState(
  state: UpdateState,
  actions: Pick<
    DesktopUpdates,
    'check' | 'download' | 'install' | 'relaunch' | 'postpone' | 'retry' | 'dismiss'
  >,
): NoticeView | null {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'checking':
      return { title: 'Checking for updates…', actions: [], dismissLabel: 'Dismiss' };
    case 'up-to-date':
      return {
        title: 'PumpOS is up to date',
        detail: `Version ${state.currentVersion} is the latest release.`,
        actions: [],
        onDismiss: actions.dismiss,
        dismissLabel: 'Dismiss',
      };
    case 'available':
      return {
        title: `PumpOS ${state.update.version} is available`,
        detail: `You are on ${state.currentVersion}. Download when it suits the station.`,
        notes: state.update.notes,
        actions: [
          { label: 'Download update', onClick: actions.download, variant: 'primary' },
          { label: 'Not now', onClick: actions.postpone, variant: 'ghost' },
        ],
        dismissLabel: 'Dismiss',
      };
    case 'downloading':
      return {
        title: `Downloading PumpOS ${state.update.version}`,
        detail: formatProgress(state.progress),
        progress: state.progress,
        actions: [],
        dismissLabel: 'Dismiss',
      };
    case 'downloaded':
      return {
        title: `PumpOS ${state.update.version} is ready to install`,
        detail: 'PumpOS will restart to finish. Nothing installs until you say so.',
        actions: [
          { label: 'Install and restart', onClick: actions.install, variant: 'primary' },
          { label: 'Later', onClick: actions.postpone, variant: 'ghost' },
        ],
        dismissLabel: 'Later',
      };
    case 'restart-blocked':
      return {
        title: 'Restart postponed',
        detail: `${state.reason} PumpOS will not restart until this clears.`,
        actions: [
          { label: 'Try again', onClick: actions.install },
          { label: 'Later', onClick: actions.postpone, variant: 'ghost' },
        ],
        dismissLabel: 'Later',
      };
    case 'installing':
      return {
        title: `Installing PumpOS ${state.update.version}…`,
        detail: 'Do not close PumpOS.',
        actions: [],
        dismissLabel: 'Dismiss',
      };
    case 'relaunch-ready':
      return {
        title: `PumpOS ${state.update.version} is installed`,
        detail: 'Restart to start using it.',
        actions: [{ label: 'Restart and update', onClick: actions.relaunch, variant: 'primary' }],
        dismissLabel: 'Later',
      };
    case 'failed':
      return {
        title: 'Update failed',
        detail: state.error.message,
        actions: [{ label: retryLabel(state.retry), onClick: actions.retry }],
        onDismiss: actions.dismiss,
        dismissLabel: 'Dismiss',
      };
  }
}

function retryLabel(retry: 'check' | 'download' | 'install'): string {
  if (retry === 'check') return 'Check again';
  if (retry === 'download') return 'Retry download';
  return 'Retry install';
}

function formatProgress(progress: { downloadedBytes: number; totalBytes: number | null }): string {
  // No content length means no honest percentage. Say what is known instead of
  // inventing a bar that creeps toward a number nobody measured.
  if (!progress.totalBytes) return `${formatMb(progress.downloadedBytes)} downloaded`;
  const percent = Math.floor((progress.downloadedBytes / progress.totalBytes) * 100);
  return `${formatMb(progress.downloadedBytes)} of ${formatMb(progress.totalBytes)} (${percent}%)`;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
