import React, { useState } from 'react';
import { Banner, Button, Drawer, MeterRow, type BannerSeverity } from '@pump/ui';
import type { DesktopUpdates } from './useDesktopUpdates.js';
import type { UpdateState } from './types.js';
import { releaseNotesBody, releaseSummaryLine } from './version.js';

/**
 * The operator-facing surface for desktop updates.
 *
 * Built on the shared `Banner` primitive, which is exactly what this is: "the
 * persistent counterpart to a transient toast… for conditions the user should
 * keep seeing until resolved". A toast is the wrong shape — it auto-expires and
 * dismisses on any click, so "Download update" would dismiss the notice that
 * offers it.
 *
 * The notice is genuinely compact: the offered version, at most one line of
 * summary, and the one thing the operator can do. It never scrolls inside
 * itself and never grows to hold the full release notes — those live behind
 * "What's new", in the `Drawer` this repository already uses for detail. Banner
 * is therefore used as designed, with placement (corner, width) as the only
 * styling here; nothing about its internal layout is overridden.
 *
 * Deliberately pinned to the bottom corner rather than shown as a startup
 * modal: an update is never more important than the shift in front of the
 * operator, so it must be dismissible, ignorable, and incapable of blocking
 * navigation or data entry. Every transition past "an update exists" needs an
 * explicit click.
 *
 * Accessibility comes from Banner's `role="status"` (an implicit polite live
 * region), so checks, progress, failures and blocked restarts are announced
 * without focus being stolen; every action is an ordinary button in DOM order.
 */
export const UpdateNotice: React.FC<{ updates: DesktopUpdates }> = ({ updates }) => {
  const { state } = updates;
  const view = updates.enabled && state ? describeUpdateState(state, updates) : null;
  // Notes belong to the offer, not to the session. Remembering *which* offer
  // the drawer was opened for closes it by derivation once the state moves on
  // (downloaded, failed, dismissed), with no effect to resynchronise. The
  // version is part of that identity: one offer replacing another must not
  // leave the new notes open under the old intent.
  const [notesOpenFor, setNotesOpenFor] = useState<string | null>(null);

  if (!view) return null;
  const offer = `${view.key}:${view.version ?? ''}`;
  const notesOpen = notesOpenFor === offer;

  return (
    <>
      <Banner
        // Banner hides itself locally once dismissed. Keying by phase gives each
        // state its own instance, so dismissing "up to date" cannot also swallow
        // the "ready to install" notice that follows.
        key={view.key}
        severity={view.severity}
        title={view.title}
        actionLabel={view.action?.label}
        onAction={view.action?.onClick}
        dismissible={!!view.onDismiss}
        onDismiss={view.onDismiss?.onClick}
        dismissLabel={view.onDismiss?.label}
        style={{
          position: 'fixed',
          bottom: 'var(--space-4)',
          right: 'var(--space-4)',
          zIndex: 60,
          width: '360px',
          maxWidth: 'calc(100vw - var(--space-8))',
          // No background override: Banner's severity colour is the whole point
          // of passing a severity, and cancelling it would make a failed update
          // look exactly like an available one.
        }}
      >
        <span style={{ display: 'block' }}>
          {view.detail && !view.progress?.totalBytes ? (
            <span style={{ display: 'block', fontWeight: 400 }}>{view.detail}</span>
          ) : null}

          {/* One line, never the body. Release notes are plain text from an
              external manifest: rendered as a text node, never as markup. */}
          {view.summary ? (
            <span
              style={{
                display: 'block',
                fontWeight: 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {view.summary}
            </span>
          ) : null}

          {view.notes ? (
            <span style={{ display: 'block', marginTop: 'var(--space-1)' }}>
              <Button variant="ghost" size="xs" onClick={() => setNotesOpenFor(offer)}>
                What&apos;s new
              </Button>
            </span>
          ) : null}

          {/* Determinate downloads get the design system's meter. An unknown
              content length gets the honest readout above and no bar at all,
              rather than one creeping toward a number nobody measured. */}
          {view.progress?.totalBytes ? (
            <span style={{ display: 'block', marginTop: 'var(--space-1)' }}>
              <MeterRow
                label="Downloading"
                value={view.progress.downloadedBytes}
                max={view.progress.totalBytes}
                valueLabel={view.detail}
                tone="brand"
              />
            </span>
          ) : null}
        </span>
      </Banner>

      {view.notes ? (
        <Drawer
          isOpen={notesOpen}
          onClose={() => setNotesOpenFor(null)}
          title={`What's new in PumpOS ${view.version ?? ''}`.trim()}
          footer={
            // The drawer's backdrop covers the notice, so it carries the same
            // choices: reading the notes never strands the operator between
            // acting and putting the offer away.
            view.action || view.onDismiss ? (
              <span style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                {[
                  { choice: view.onDismiss, variant: 'secondary' as const },
                  { choice: view.action, variant: 'primary' as const },
                ].map(({ choice, variant }) =>
                  choice ? (
                    <Button
                      key={variant}
                      variant={variant}
                      onClick={() => {
                        setNotesOpenFor(null);
                        choice.onClick();
                      }}
                    >
                      {choice.label}
                    </Button>
                  ) : null,
                )}
              </span>
            ) : undefined
          }
        >
          <p
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
              fontSize: '14px',
              lineHeight: 1.6,
              color: 'var(--text-default)',
            }}
          >
            {view.notes}
          </p>
        </Drawer>
      ) : null}
    </>
  );
};

interface NoticeView {
  /** The state this view belongs to; resets Banner's local dismissal. */
  key: UpdateState['phase'];
  severity: BannerSeverity;
  title: string;
  /** Names the notes drawer. Present only where notes are, i.e. with an offer. */
  version?: string;
  detail?: string;
  /** At most one line, for the compact notice. Never the whole body. */
  summary?: string;
  /** The full release notes, shown only in the drawer. */
  notes?: string;
  progress?: { downloadedBytes: number; totalBytes: number | null };
  /** The one thing the operator can do next. Absent while PumpOS is working. */
  action?: { label: string; onClick: () => void };
  /**
   * Present when the operator may put this away, absent when they must not.
   * Carries its own label: putting an offered update away ("Not now") is a
   * different act from discarding a stale message ("Dismiss").
   */
  onDismiss?: { label: string; onClick: () => void };
}

/**
 * The whole notice is a pure projection of one coordinator state, which is why
 * this function is exported: the copy an operator reads in each state is
 * testable without rendering anything.
 *
 * Every state resolves to at most one action plus an optional dismissal —
 * which is exactly Banner's shape, and the reason "Not now" and "Later" are the
 * dismissal rather than buttons of their own.
 */
export function describeUpdateState(
  state: UpdateState,
  actions: Pick<
    DesktopUpdates,
    'check' | 'download' | 'install' | 'relaunch' | 'postpone' | 'retry' | 'dismiss'
  >,
): NoticeView | null {
  switch (state.phase) {
    // Nothing to say: no notice at all, rather than an empty one.
    case 'idle':
    case 'postponed':
      return null;
    case 'checking':
      return { key: state.phase, severity: 'info', title: 'Checking for updates…' };
    case 'up-to-date':
      return {
        key: state.phase,
        severity: 'success',
        title: 'PumpOS is up to date',
        detail: `Version ${state.currentVersion} is the latest release.`,
        onDismiss: { label: 'Dismiss', onClick: actions.dismiss },
      };
    case 'available':
      return {
        key: state.phase,
        severity: 'info',
        title: `PumpOS ${state.update.version} is available`,
        version: state.update.version,
        detail: `You are on ${state.currentVersion}. Download when it suits the station.`,
        summary: releaseSummaryLine(state.update.notes),
        notes: releaseNotesBody(state.update.notes),
        action: { label: 'Download update', onClick: actions.download },
        onDismiss: { label: 'Not now', onClick: actions.postpone },
      };
    case 'downloading':
      return {
        key: state.phase,
        severity: 'info',
        title: `Downloading PumpOS ${state.update.version}`,
        detail: formatProgress(state.progress),
        progress: state.progress,
      };
    case 'downloaded':
      return {
        key: state.phase,
        severity: 'info',
        title: `PumpOS ${state.update.version} is ready to install`,
        detail: 'PumpOS will restart to finish. Nothing installs until you say so.',
        action: { label: 'Install and restart', onClick: actions.install },
        onDismiss: { label: 'Later', onClick: actions.postpone },
      };
    case 'restart-blocked':
      return {
        key: state.phase,
        severity: 'warning',
        title: 'Restart postponed',
        detail: `${state.reason} PumpOS will not restart until this clears.`,
        action: { label: 'Try again', onClick: actions.install },
        onDismiss: { label: 'Later', onClick: actions.postpone },
      };
    case 'installing':
      return {
        key: state.phase,
        severity: 'info',
        title: `Installing PumpOS ${state.update.version}…`,
        detail: 'Do not close PumpOS.',
      };
    case 'relaunch-ready':
      // No dismissal: the new binary is already on disk, and hiding this would
      // leave the operator on the old one with no way back to the button.
      return {
        key: state.phase,
        severity: 'success',
        title: `PumpOS ${state.update.version} is installed`,
        detail: 'Restart to start using it.',
        action: { label: 'Restart and update', onClick: actions.relaunch },
      };
    case 'failed':
      return {
        key: state.phase,
        severity: 'danger',
        title: 'Update failed',
        detail: state.error.message,
        action: { label: retryLabel(state.retry), onClick: actions.retry },
        onDismiss: { label: 'Dismiss', onClick: actions.dismiss },
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
