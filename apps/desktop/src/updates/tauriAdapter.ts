import type {
  DownloadProgress,
  RestartReadiness,
  RestartReadinessResult,
  UpdateHandle,
  UpdatePlatform,
  UpdaterAdapter,
} from './types.js';

/**
 * The real adapter: the official `@tauri-apps/plugin-updater` and
 * `@tauri-apps/plugin-process` behind the coordinator's ports.
 *
 * Everything here is thin on purpose — signature verification, artifact
 * selection and installation all live in the plugin, and the decision-making
 * lives in the coordinator. Imports are dynamic so a non-desktop bundle (or a
 * node test run) never pulls the plugins in.
 *
 * `plugin-os` is the third plugin here and earns its place: macOS and Windows
 * genuinely differ after `install()` — the Windows installer terminates PumpOS,
 * macOS leaves it running until the operator restarts — so the coordinator has
 * to know which one it is on. The alternative is sniffing `navigator.userAgent`
 * inside a webview, which is a guess where `os:allow-platform` is an answer.
 */
export async function createTauriUpdaterAdapter(): Promise<UpdaterAdapter> {
  const [{ check }, { getVersion }, { platform }] = await Promise.all([
    import('@tauri-apps/plugin-updater'),
    import('@tauri-apps/api/app'),
    import('@tauri-apps/plugin-os'),
  ]);

  const currentVersion = await getVersion();
  const osPlatform = platform();

  return {
    currentVersion,
    platform: toUpdatePlatform(osPlatform),
    async check() {
      const update = await check();
      if (!update) return null;
      return wrapUpdate(update);
    },
    async relaunch() {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}

/**
 * macOS and Windows are the only supported targets, but `platform()` can return
 * anything. An unknown platform is reported as Windows-like (install closes the
 * app), which is the conservative reading: it makes the readiness gate stricter,
 * never looser.
 */
function toUpdatePlatform(value: string): UpdatePlatform {
  return value === 'macos' ? 'macos' : 'windows';
}

type TauriUpdate = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>;

function wrapUpdate(update: NonNullable<TauriUpdate>): UpdateHandle {
  return {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
    async download(onProgress: (progress: DownloadProgress) => void) {
      let downloadedBytes = 0;
      let totalBytes: number | null = null;
      await update.download((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? null;
          downloadedBytes = 0;
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
        }
        onProgress({ downloadedBytes, totalBytes });
      });
    },
    async install() {
      await update.install();
    },
    async close() {
      await update.close();
    },
  };
}

/**
 * The phase-one restart-readiness provider.
 *
 * PumpOS has no durable local write outbox yet, so there is nothing that can
 * report pending local writes and the honest answer is "safe". This deliberately
 * does NOT consult `navigator.onLine`: being offline is not proof that work
 * would be lost, and being online is not proof that it would not. When the
 * outbox lands it replaces this implementation and the coordinator, the UI and
 * their tests are untouched.
 */
export function createDefaultRestartReadiness(): RestartReadiness {
  return {
    async check(): Promise<RestartReadinessResult> {
      return { safe: true };
    },
  };
}
