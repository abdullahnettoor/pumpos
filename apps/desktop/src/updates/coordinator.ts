import {
  type AvailableUpdate,
  type DownloadProgress,
  type RestartReadiness,
  type UpdateHandle,
  type UpdateError,
  type UpdateState,
  type UpdaterAdapter,
  type RetryAction,
} from './types.js';
import {
  isNewerVersion,
  normalizeUpdateError,
  parseVersion,
  sanitizeReleaseNotes,
} from './version.js';

/**
 * The single owner of desktop update state.
 *
 * Everything the operator can see or do about updates goes through here: the
 * automatic post-shell check, the manual check, the download, the readiness
 * gate, the installation and the relaunch. The UI is a projection of
 * `getState()` and never talks to the updater plugin itself.
 *
 * Three rules this class exists to enforce:
 *
 *  1. **Nothing is automatic past the check.** A newer version is an offer.
 *     The operator starts the download and the installation; PumpOS never
 *     restarts a station's machine on its own.
 *  2. **Restart readiness is asked, never assumed.** `RestartReadiness` is the
 *     only authority on whether the app may close, and it is consulted before
 *     install on every platform — on Windows because the installer exits the
 *     app, on macOS because the relaunch does.
 *  3. **A failure never damages the installed app.** Every failure lands in
 *     `failed` with a retry action and leaves the current installation usable.
 */
export class DesktopUpdateCoordinator {
  private state: UpdateState;
  private readonly listeners = new Set<(state: UpdateState) => void>();
  /** The plugin-side handle for the current offer; needed to download/install. */
  private handle: UpdateHandle | null = null;
  private checkInFlight: Promise<void> | null = null;
  private automaticCheckStarted = false;

  constructor(
    private readonly updater: UpdaterAdapter,
    private readonly readiness: RestartReadiness,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.state = { phase: 'idle', currentVersion: updater.currentVersion };
  }

  getState(): UpdateState {
    return this.state;
  }

  subscribe(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * The once-per-session check, fired after the authenticated shell is ready.
   *
   * It is a no-op on every later call, so a re-render or a session refresh
   * cannot turn "check once" into a poll. It never throws: a boot-time check
   * that could reject would be a way for update infrastructure to break the
   * shell, which is exactly what this feature must not do.
   */
  async checkOnceAfterShellReady(): Promise<void> {
    if (this.automaticCheckStarted) return;
    this.automaticCheckStarted = true;
    await this.check();
  }

  /**
   * Check the stable channel. Also the operator-initiated check behind the menu
   * entry — both entry points produce the same states, which is what keeps the
   * manual check honest about what the automatic one did.
   */
  async check(): Promise<void> {
    // A manual click while the automatic check is still in flight should join
    // that check rather than start a second one against the same endpoint.
    if (this.checkInFlight) return this.checkInFlight;
    // A postponed offer comes back rather than being re-fetched: the operator
    // asked to be reminded, not to spend a station's bandwidth twice.
    if (this.state.phase === 'postponed') {
      const { update, resume } = this.state;
      this.emit({ phase: resume, currentVersion: this.updater.currentVersion, update });
      return;
    }
    // An offer is already on screen: re-checking would throw away a finished
    // download for no gain. Re-announce what we have instead — a manual check
    // that answers with silence reads as a broken button. The copy matters:
    // subscribers compare by reference, so re-emitting the same object would
    // change nothing at all.
    if (this.isBusyWithOffer()) {
      this.emit({ ...this.state });
      return;
    }

    const run = this.runCheck();
    this.checkInFlight = run;
    try {
      await run;
    } finally {
      this.checkInFlight = null;
    }
  }

  private async runCheck(): Promise<void> {
    this.emit({ phase: 'checking', currentVersion: this.updater.currentVersion });
    let handle: UpdateHandle | null;
    try {
      handle = await this.updater.check();
    } catch (cause) {
      this.fail(normalizeUpdateError(cause), 'check');
      return;
    }

    if (!handle) {
      await this.release(null);
      this.emit({
        phase: 'up-to-date',
        currentVersion: this.updater.currentVersion,
        checkedAt: this.now(),
      });
      return;
    }

    if (!parseVersion(handle.version)) {
      await this.release(handle);
      this.fail(
        {
          kind: 'malformed',
          message: `The update server offered an unreadable version ("${handle.version}").`,
        },
        'check',
      );
      return;
    }

    // Not newer is not an error: a republished or rolled-back manifest simply
    // means this install is current. Phase one has no downgrade path.
    if (!isNewerVersion(handle.version, this.updater.currentVersion)) {
      await this.release(handle);
      this.emit({
        phase: 'up-to-date',
        currentVersion: this.updater.currentVersion,
        checkedAt: this.now(),
      });
      return;
    }

    await this.release(this.handle);
    this.handle = handle;
    const update: AvailableUpdate = {
      version: handle.version,
      notes: sanitizeReleaseNotes(handle.notes),
      ...(handle.date ? { date: handle.date } : {}),
    };
    this.emit({ phase: 'available', currentVersion: this.updater.currentVersion, update });
  }

  /**
   * Download the offered update. Explicitly operator-initiated: a check never
   * pulls bytes down a station's connection on its own.
   */
  async download(): Promise<void> {
    const update = this.offeredUpdate();
    const handle = this.handle;
    if (!update || !handle) return;
    if (this.state.phase === 'downloading' || this.state.phase === 'installing') return;

    const progress: DownloadProgress = { downloadedBytes: 0, totalBytes: null };
    this.emit({
      phase: 'downloading',
      currentVersion: this.updater.currentVersion,
      update,
      progress,
    });

    try {
      await handle.download((next) => {
        if (this.state.phase !== 'downloading') return;
        this.emit({
          phase: 'downloading',
          currentVersion: this.updater.currentVersion,
          update,
          progress: next,
        });
      });
    } catch (cause) {
      // The partial download is discarded by the plugin; the installed app is
      // untouched and the same offer can be retried.
      this.fail(normalizeUpdateError(cause), 'download', update);
      return;
    }

    this.emit({ phase: 'downloaded', currentVersion: this.updater.currentVersion, update });
  }

  /**
   * Apply the downloaded update.
   *
   * Readiness is checked first on both platforms. On Windows the installer
   * terminates PumpOS, so a blocked readiness result must stop us *before*
   * `install()`; on macOS the relaunch is a separate, operator-confirmed step.
   */
  async install(): Promise<void> {
    const update = this.offeredUpdate();
    const handle = this.handle;
    if (!update || !handle) return;
    if (this.state.phase !== 'downloaded' && this.state.phase !== 'restart-blocked') return;

    let verdict;
    try {
      verdict = await this.readiness.check();
    } catch (cause) {
      // An unreadable readiness answer is treated as "not safe". Installing
      // anyway could discard queued station writes.
      this.emit({
        phase: 'restart-blocked',
        currentVersion: this.updater.currentVersion,
        update,
        reason: normalizeUpdateError(cause).message,
      });
      return;
    }

    if (!verdict.safe) {
      this.emit({
        phase: 'restart-blocked',
        currentVersion: this.updater.currentVersion,
        update,
        reason: verdict.reason,
      });
      return;
    }

    this.emit({ phase: 'installing', currentVersion: this.updater.currentVersion, update });
    try {
      await handle.install();
    } catch (cause) {
      const normalized = normalizeUpdateError(cause);
      this.fail(
        normalized.kind === 'unknown'
          ? { kind: 'install', message: normalized.message }
          : normalized,
        'install',
        update,
      );
      return;
    }

    // On Windows the installer has already replaced the app and terminated the
    // process, so in practice this line is never reached there — and if it is,
    // "installing" is still the truthful state: the operator's next launch is
    // the new version, and there is no relaunch for us to offer.
    if (this.updater.platform === 'windows') return;

    // macOS keeps running the old process until the operator asks for the
    // restart, so the offer of that restart is a state of its own.
    this.emit({ phase: 'relaunch-ready', currentVersion: this.updater.currentVersion, update });
  }

  /** The operator's explicit "Restart and update". */
  async relaunch(): Promise<void> {
    if (this.state.phase !== 'relaunch-ready') return;
    const update = this.state.update;
    try {
      await this.updater.relaunch();
    } catch (cause) {
      const normalized = normalizeUpdateError(cause);
      this.fail({ kind: 'install', message: normalized.message }, 'install', update);
    }
  }

  /**
   * Put a pending offer back into its last actionable state so the operator can
   * return to it later in the same session. A finished download is kept: the
   * bytes are already on disk and re-fetching them helps nobody.
   */
  postpone(): void {
    const update = this.offeredUpdate();
    if (!update) return;
    if (this.state.phase === 'downloading' || this.state.phase === 'installing') return;
    // Already installed: only the restart is left, and hiding that prompt would
    // leave the operator running the old binary with no way back to the button.
    if (this.state.phase === 'relaunch-ready') return;

    // Postponing clears the notice but keeps the offer. A finished download
    // resumes as "downloaded", so saying "later" never costs the operator the
    // bytes they already paid for.
    const resume =
      this.state.phase === 'downloaded' || this.state.phase === 'restart-blocked'
        ? 'downloaded'
        : 'available';
    this.emit({ phase: 'postponed', currentVersion: this.updater.currentVersion, update, resume });
  }

  /** Re-run whichever step failed. */
  async retry(): Promise<void> {
    if (this.state.phase !== 'failed') return;
    const { retry, update } = this.state;
    if (retry === 'check' || !update) {
      this.emit({ phase: 'idle', currentVersion: this.updater.currentVersion });
      await this.check();
      return;
    }
    if (retry === 'download') {
      this.emit({ phase: 'available', currentVersion: this.updater.currentVersion, update });
      await this.download();
      return;
    }
    this.emit({ phase: 'downloaded', currentVersion: this.updater.currentVersion, update });
    await this.install();
  }

  /** Dismiss a terminal, non-actionable state (up to date, failed check). */
  dismiss(): void {
    if (this.state.phase === 'up-to-date' || this.state.phase === 'failed') {
      this.emit({ phase: 'idle', currentVersion: this.updater.currentVersion });
    }
  }

  private offeredUpdate(): AvailableUpdate | null {
    return 'update' in this.state && this.state.update ? this.state.update : null;
  }

  private isBusyWithOffer(): boolean {
    return (
      this.state.phase === 'available' ||
      this.state.phase === 'downloading' ||
      this.state.phase === 'downloaded' ||
      this.state.phase === 'restart-blocked' ||
      this.state.phase === 'installing' ||
      this.state.phase === 'relaunch-ready'
    );
  }

  private fail(error: UpdateError, retry: RetryAction, update?: AvailableUpdate): void {
    this.emit({
      phase: 'failed',
      currentVersion: this.updater.currentVersion,
      error,
      retry,
      ...(update ? { update } : {}),
    });
  }

  private async release(handle: UpdateHandle | null): Promise<void> {
    if (!handle?.close) return;
    try {
      await handle.close();
    } catch {
      // Releasing plugin resources is best-effort; failing to do so must not
      // become an operator-visible update error.
    }
  }

  private emit(state: UpdateState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
