import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DesktopUpdateCoordinator } from './coordinator.js';
import { detectTauri, shouldEnableUpdates } from './environment.js';
import { createDefaultRestartReadiness, createTauriUpdaterAdapter } from './tauriAdapter.js';
import type { UpdateState } from './types.js';
import { buildEnvironment } from '../buildEnv.js';

export interface DesktopUpdates {
  /** `false` outside a packaged production desktop build — the UI stays hidden. */
  enabled: boolean;
  /** The installed version, once the shell can report it. */
  currentVersion: string | null;
  state: UpdateState | null;
  check: () => void;
  download: () => void;
  install: () => void;
  relaunch: () => void;
  postpone: () => void;
  retry: () => void;
  dismiss: () => void;
}

const DISABLED: DesktopUpdates = {
  enabled: false,
  currentVersion: null,
  state: null,
  check: () => {},
  download: () => {},
  install: () => {},
  relaunch: () => {},
  postpone: () => {},
  retry: () => {},
  dismiss: () => {},
};

/**
 * Wire the update coordinator to React for the desktop shell.
 *
 * `shellReady` is the gate: the automatic check fires once the authenticated
 * shell is on screen, never during boot. Update infrastructure must not be able
 * to delay or break a station's morning start-up, so nothing here is awaited on
 * the render path and every failure lands in the coordinator's `failed` state
 * rather than in an exception.
 */
export function useDesktopUpdates(shellReady: boolean): DesktopUpdates {
  const [coordinator, setCoordinator] = useState<DesktopUpdateCoordinator | null>(null);
  const enabled = useMemo(
    () =>
      shouldEnableUpdates({
        isTauri: detectTauri(),
        buildEnvironment,
        isDevServer: import.meta.env.DEV,
        forceEnabled: import.meta.env.VITE_UPDATER_FORCE === 'true',
      }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const adapter = await createTauriUpdaterAdapter();
        if (cancelled) return;
        setCoordinator(new DesktopUpdateCoordinator(adapter, createDefaultRestartReadiness()));
      } catch (cause) {
        // No updater means no update UI. It must never mean no application.
        console.error('Desktop updater unavailable:', cause);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const startedRef = useRef(false);
  useEffect(() => {
    if (!coordinator || !shellReady || startedRef.current) return;
    startedRef.current = true;
    void coordinator.checkOnceAfterShellReady();
  }, [coordinator, shellReady]);

  const state = useCoordinatorState(coordinator);

  const run = useCallback(
    (action: (c: DesktopUpdateCoordinator) => void | Promise<void>) => () => {
      if (coordinator) void action(coordinator);
    },
    [coordinator],
  );

  return useMemo(() => {
    if (!enabled) return DISABLED;
    return {
      enabled,
      currentVersion: state?.currentVersion ?? null,
      state,
      check: run((c) => c.check()),
      download: run((c) => c.download()),
      install: run((c) => c.install()),
      relaunch: run((c) => c.relaunch()),
      postpone: run((c) => c.postpone()),
      retry: run((c) => c.retry()),
      dismiss: run((c) => c.dismiss()),
    };
  }, [enabled, state, run]);
}

function useCoordinatorState(coordinator: DesktopUpdateCoordinator | null): UpdateState | null {
  const subscribe = useCallback(
    (onChange: () => void) => coordinator?.subscribe(onChange) ?? (() => {}),
    [coordinator],
  );
  const snapshot = useCallback(() => coordinator?.getState() ?? null, [coordinator]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
