import { describe, expect, it, vi } from 'vitest';
import { DesktopUpdateCoordinator } from './coordinator.js';
import type {
  DownloadProgress,
  RestartReadiness,
  RestartReadinessResult,
  UpdateHandle,
  UpdatePlatform,
  UpdaterAdapter,
} from './types.js';

/**
 * The whole update flow is exercised through these fakes: no Tauri, no network,
 * no GitHub. That is the point of the adapter port — every state an operator can
 * land in is reachable from a test.
 */

interface FakeUpdateOptions {
  version?: string;
  notes?: string | null;
  downloadFails?: Error;
  installFails?: Error;
  progress?: DownloadProgress[];
}

function fakeHandle(options: FakeUpdateOptions = {}): UpdateHandle & { closed: boolean } {
  const handle = {
    version: options.version ?? '1.1.0',
    notes: options.notes ?? 'Fixes drawer reconciliation rounding.',
    date: '2026-05-01',
    closed: false,
    async download(onProgress: (p: DownloadProgress) => void) {
      for (const step of options.progress ?? [
        { downloadedBytes: 50, totalBytes: 100 },
        { downloadedBytes: 100, totalBytes: 100 },
      ]) {
        onProgress(step);
      }
      if (options.downloadFails) throw options.downloadFails;
    },
    async install() {
      if (options.installFails) throw options.installFails;
    },
    async close() {
      handle.closed = true;
    },
  };
  return handle;
}

function fakeUpdater(
  overrides: Partial<UpdaterAdapter> & { platform?: UpdatePlatform } = {},
): UpdaterAdapter & { relaunchCount: number } {
  const state = {
    currentVersion: overrides.currentVersion ?? '1.0.0',
    platform: overrides.platform ?? ('macos' as UpdatePlatform),
    relaunchCount: 0,
    check: overrides.check ?? (async () => null),
    async relaunch() {
      state.relaunchCount += 1;
      if (overrides.relaunch) await overrides.relaunch();
    },
  };
  return state;
}

function readiness(result: RestartReadinessResult | Error = { safe: true }): RestartReadiness {
  return {
    async check() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('DesktopUpdateCoordinator — checking', () => {
  it('starts idle at the installed version', () => {
    const coordinator = new DesktopUpdateCoordinator(fakeUpdater(), readiness());
    expect(coordinator.getState()).toEqual({ phase: 'idle', currentVersion: '1.0.0' });
  });

  it('reports up to date when nothing newer is offered', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => null }),
      readiness(),
      () => 1_700_000,
    );
    await coordinator.check();
    expect(coordinator.getState()).toEqual({
      phase: 'up-to-date',
      currentVersion: '1.0.0',
      checkedAt: 1_700_000,
    });
  });

  it('offers a newer version with sanitized plain-text notes', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({
        check: async () => fakeHandle({ notes: '  <b>Nozzle</b> fixes\r\nand more ' }),
      }),
      readiness(),
    );
    await coordinator.check();
    const state = coordinator.getState();
    expect(state.phase).toBe('available');
    if (state.phase !== 'available') throw new Error('unreachable');
    expect(state.update.version).toBe('1.1.0');
    // Kept as literal text — the UI renders it as text nodes, never as markup.
    expect(state.update.notes).toBe('<b>Nozzle</b> fixes\nand more');
  });

  it('treats an older or identical offer as up to date (no downgrades)', async () => {
    for (const version of ['1.0.0', '0.9.9']) {
      const coordinator = new DesktopUpdateCoordinator(
        fakeUpdater({ check: async () => fakeHandle({ version }) }),
        readiness(),
      );
      await coordinator.check();
      expect(coordinator.getState().phase).toBe('up-to-date');
    }
  });

  it('normalizes malformed update metadata into a retryable failure', async () => {
    const handle = fakeHandle({ version: 'latest-build' });
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => handle }),
      readiness(),
    );
    await coordinator.check();
    const state = coordinator.getState();
    expect(state.phase).toBe('failed');
    if (state.phase !== 'failed') throw new Error('unreachable');
    expect(state.error.kind).toBe('malformed');
    expect(state.retry).toBe('check');
    expect(handle.closed).toBe(true);
  });

  it.each([
    ['offline', new Error('Failed to fetch'), 'offline'],
    ['timeout', new Error('request timed out'), 'timeout'],
    ['signature', new Error('signature verification failed'), 'signature'],
  ])('normalizes a %s check failure', async (_label, thrown, kind) => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({
        check: async () => {
          throw thrown;
        },
      }),
      readiness(),
    );
    await coordinator.check();
    const state = coordinator.getState();
    expect(state.phase).toBe('failed');
    if (state.phase !== 'failed') throw new Error('unreachable');
    expect(state.error.kind).toBe(kind);
  });

  it('never rejects, so a failing check cannot break the shell', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({
        check: async () => {
          throw new Error('boom');
        },
      }),
      readiness(),
    );
    await expect(coordinator.checkOnceAfterShellReady()).resolves.toBeUndefined();
  });

  it('runs the automatic check exactly once per session', async () => {
    const check = vi.fn(async () => null);
    const coordinator = new DesktopUpdateCoordinator(fakeUpdater({ check }), readiness());
    await coordinator.checkOnceAfterShellReady();
    await coordinator.checkOnceAfterShellReady();
    await coordinator.checkOnceAfterShellReady();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('does not re-check while an offer is pending', async () => {
    const check = vi.fn(async () => fakeHandle());
    const coordinator = new DesktopUpdateCoordinator(fakeUpdater({ check }), readiness());
    await coordinator.check();
    await coordinator.check();
    expect(check).toHaveBeenCalledTimes(1);
    expect(coordinator.getState().phase).toBe('available');
  });
});

describe('DesktopUpdateCoordinator — downloading', () => {
  it('only downloads when asked, and reports byte progress', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => fakeHandle() }),
      readiness(),
    );
    const seen: string[] = [];
    coordinator.subscribe((state) => seen.push(state.phase));

    await coordinator.check();
    expect(seen).toEqual(['checking', 'available']);

    await coordinator.download();
    expect(seen).toEqual([
      'checking',
      'available',
      'downloading',
      'downloading',
      'downloading',
      'downloaded',
    ]);
    expect(coordinator.getState().phase).toBe('downloaded');
  });

  it('keeps the indeterminate state honest when no total size is known', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({
        check: async () => fakeHandle({ progress: [{ downloadedBytes: 512, totalBytes: null }] }),
      }),
      readiness(),
    );
    const progress: (DownloadProgress | null)[] = [];
    coordinator.subscribe((state) => {
      if (state.phase === 'downloading') progress.push(state.progress);
    });
    await coordinator.check();
    await coordinator.download();
    expect(progress.at(-1)).toEqual({ downloadedBytes: 512, totalBytes: null });
  });

  it('leaves the installed app usable after a failed download and allows a retry', async () => {
    // The connection drops mid-download once, then recovers. The retry reuses
    // the same offer rather than starting the whole flow again.
    let attempt = 0;
    const handle = fakeHandle();
    const original = handle.download.bind(handle);
    handle.download = async (onProgress) => {
      attempt += 1;
      await original(onProgress);
      if (attempt === 1) throw new Error('Failed to fetch');
    };
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => handle }),
      readiness(),
    );
    await coordinator.check();
    await coordinator.download();

    const failed = coordinator.getState();
    expect(failed.phase).toBe('failed');
    if (failed.phase !== 'failed') throw new Error('unreachable');
    expect(failed.error.kind).toBe('offline');
    expect(failed.retry).toBe('download');
    // The offer survives the failure, so retrying does not force another check.
    expect(failed.update?.version).toBe('1.1.0');

    await coordinator.retry();
    expect(coordinator.getState().phase).toBe('downloaded');
  });
});

describe('DesktopUpdateCoordinator — installing and restarting', () => {
  it('blocks installation with a concrete reason when local writes are unsafe', async () => {
    const install = vi.fn();
    const handle = fakeHandle();
    handle.install = install;
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => handle }),
      readiness({ safe: false, reason: '3 entries have not reached the cloud yet.' }),
    );
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();

    const state = coordinator.getState();
    expect(state.phase).toBe('restart-blocked');
    if (state.phase !== 'restart-blocked') throw new Error('unreachable');
    expect(state.reason).toBe('3 entries have not reached the cloud yet.');
    // The installer is never invoked while readiness says no — on Windows it
    // would have closed the app out from under pending work.
    expect(install).not.toHaveBeenCalled();
  });

  it('treats an unreadable readiness answer as unsafe', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => fakeHandle() }),
      readiness(new Error('outbox unavailable')),
    );
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();
    expect(coordinator.getState().phase).toBe('restart-blocked');
  });

  it('installs once readiness becomes safe, without a second download', async () => {
    let safe = false;
    const downloads = vi.fn();
    const handle = fakeHandle();
    const original = handle.download.bind(handle);
    handle.download = async (onProgress) => {
      downloads();
      await original(onProgress);
    };
    const coordinator = new DesktopUpdateCoordinator(fakeUpdater({ check: async () => handle }), {
      async check() {
        return safe ? { safe: true } : { safe: false, reason: 'Pending local writes.' };
      },
    });
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();
    expect(coordinator.getState().phase).toBe('restart-blocked');

    safe = true;
    await coordinator.install();
    expect(coordinator.getState().phase).toBe('relaunch-ready');
    expect(downloads).toHaveBeenCalledTimes(1);
  });

  it('never relaunches on its own; the operator asks for the restart', async () => {
    const updater = fakeUpdater({ check: async () => fakeHandle() });
    const coordinator = new DesktopUpdateCoordinator(updater, readiness());
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();
    expect(updater.relaunchCount).toBe(0);

    await coordinator.relaunch();
    expect(updater.relaunchCount).toBe(1);
  });

  it('surfaces an install failure as retryable without losing the download', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => fakeHandle({ installFails: new Error('disk full') }) }),
      readiness(),
    );
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();

    const state = coordinator.getState();
    expect(state.phase).toBe('failed');
    if (state.phase !== 'failed') throw new Error('unreachable');
    expect(state.error.kind).toBe('install');
    expect(state.retry).toBe('install');
  });

  it('keeps a postponed update actionable later in the same session', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => fakeHandle() }),
      readiness({ safe: false, reason: 'Shift close in progress.' }),
    );
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();
    coordinator.postpone();

    // Postponing a downloaded update returns it to "downloaded", not to
    // "available": the bytes are on disk and re-fetching them helps nobody.
    expect(coordinator.getState().phase).toBe('downloaded');
  });

  it('postpones an un-downloaded offer back to available', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => fakeHandle() }),
      readiness(),
    );
    await coordinator.check();
    coordinator.postpone();
    expect(coordinator.getState().phase).toBe('available');
  });
});

describe('DesktopUpdateCoordinator — postponing an installed update', () => {
  it('keeps the restart prompt after installation: postponing must not hide it', async () => {
    const coordinator = new DesktopUpdateCoordinator(
      fakeUpdater({ check: async () => fakeHandle() }),
      readiness(),
    );
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();
    coordinator.postpone();
    // The binary on disk is already the new one; only the restart is left, and
    // there is no way back to that button once it is dismissed.
    expect(coordinator.getState().phase).toBe('relaunch-ready');
  });
});

describe('DesktopUpdateCoordinator — platform differences', () => {
  it('offers no relaunch on Windows: the installer already closed the app', async () => {
    const updater = fakeUpdater({ platform: 'windows', check: async () => fakeHandle() });
    const coordinator = new DesktopUpdateCoordinator(updater, readiness());
    await coordinator.check();
    await coordinator.download();
    await coordinator.install();
    expect(coordinator.getState().phase).toBe('installing');
    expect(updater.relaunchCount).toBe(0);
  });

  it('re-announces a pending offer when the operator checks again', async () => {
    const check = vi.fn(async () => fakeHandle());
    const coordinator = new DesktopUpdateCoordinator(fakeUpdater({ check }), readiness());
    await coordinator.check();

    const seen: string[] = [];
    coordinator.subscribe((state) => seen.push(state.phase));
    await coordinator.check();

    // No second network call, but the operator gets an answer rather than a
    // button that appears to do nothing.
    expect(check).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['available']);
  });
});
