/**
 * Ports and observable states for the desktop update flow.
 *
 * The coordinator (`coordinator.ts`) owns every externally visible update state
 * and depends only on the small ports declared here, so tests drive the whole
 * flow through fakes and never touch Tauri, the network, or GitHub.
 *
 * Two signatures are deliberately distinct concepts:
 *   - the **Tauri updater signature**, verified by the updater plugin itself
 *     before an artifact is applied. Mandatory. Failures surface here as an
 *     `'signature'` error kind.
 *   - **operating-system signing** (Apple Developer ID / Windows Authenticode),
 *     which PumpOS does not have in phase one. That produces Gatekeeper and
 *     SmartScreen warnings at install time and is invisible to this module.
 */

/** Desktop targets PumpOS ships. Linux is explicitly not a target. */
export type UpdatePlatform = 'macos' | 'windows';

/** A normalized, operator-readable failure. */
export interface UpdateError {
  kind: 'offline' | 'timeout' | 'network' | 'malformed' | 'signature' | 'install' | 'unknown';
  message: string;
}

/** Which operator action a failure can be retried with. */
export type RetryAction = 'check' | 'download' | 'install';

/** Metadata for an offer the operator can act on. */
export interface AvailableUpdate {
  version: string;
  /** Plain-text release notes. Never rendered as HTML — see UpdateNotice. */
  notes: string;
  /** Publication date as reported by the manifest, when present. */
  date?: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  /** `null` when the server gave no content length: the UI stays indeterminate. */
  totalBytes: number | null;
}

/**
 * Every externally visible state. The UI renders from this union alone, which
 * is why "restart blocked" and "relaunch ready" are states rather than flags
 * hidden inside the component.
 */
export type UpdateState =
  | { phase: 'idle'; currentVersion: string }
  | { phase: 'checking'; currentVersion: string }
  | { phase: 'up-to-date'; currentVersion: string; checkedAt: number }
  | { phase: 'available'; currentVersion: string; update: AvailableUpdate }
  | {
      phase: 'downloading';
      currentVersion: string;
      update: AvailableUpdate;
      progress: DownloadProgress;
    }
  | { phase: 'downloaded'; currentVersion: string; update: AvailableUpdate }
  | {
      phase: 'restart-blocked';
      currentVersion: string;
      update: AvailableUpdate;
      reason: string;
    }
  | { phase: 'installing'; currentVersion: string; update: AvailableUpdate }
  /** macOS only: the update is applied, the operator still owns the restart. */
  | { phase: 'relaunch-ready'; currentVersion: string; update: AvailableUpdate }
  | {
      phase: 'failed';
      currentVersion: string;
      update?: AvailableUpdate;
      error: UpdateError;
      retry: RetryAction;
    };

/** One offered update, as handed over by the updater plugin. */
export interface UpdateHandle {
  version: string;
  notes?: string | null;
  date?: string | null;
  download(onProgress: (progress: DownloadProgress) => void): Promise<void>;
  install(): Promise<void>;
  /** Release plugin-side resources. Optional so fakes stay small. */
  close?(): Promise<void>;
}

/** The updater plugin, reduced to what the coordinator needs. */
export interface UpdaterAdapter {
  readonly currentVersion: string;
  readonly platform: UpdatePlatform;
  /** Resolves `null` when the stable channel offers nothing newer. */
  check(): Promise<UpdateHandle | null>;
  /** Restart into the installed update (macOS). */
  relaunch(): Promise<void>;
}

/**
 * The single authority on whether PumpOS may be closed or relaunched.
 *
 * Owned by desktop resilience, NOT by this module, and deliberately not derived
 * from `navigator.onLine`: being online says nothing about whether queued local
 * writes have reached the cloud. When the durable outbox lands it implements
 * this interface and nothing else here changes.
 */
export interface RestartReadiness {
  check(): Promise<RestartReadinessResult>;
}

export type RestartReadinessResult = { safe: true } | { safe: false; reason: string };
