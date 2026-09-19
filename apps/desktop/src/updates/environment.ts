import type { BuildEnvironment } from '../buildEnv.js';

/**
 * Where the stable channel lives. One channel, one manifest, no Linux entry.
 *
 * `releases/latest/download/latest.json` always resolves to the newest
 * *published* release, which is why release candidates stay drafts: a draft is
 * invisible here, so a half-finished release can never reach installed clients.
 */
export const STABLE_UPDATE_ENDPOINT =
  'https://github.com/abdullahnettoor/pumpos/releases/latest/download/latest.json';

export interface UpdateEnvironment {
  /** Running inside the packaged Tauri shell (as opposed to a browser). */
  isTauri: boolean;
  buildEnvironment: BuildEnvironment;
  /** `import.meta.env.DEV` — the Vite dev server is driving the app. */
  isDevServer?: boolean;
  /** Opt-in escape hatch for deliberately exercising the flow (VITE_UPDATER_FORCE). */
  forceEnabled?: boolean;
}

/**
 * Decide whether this build may talk to the stable update channel at all.
 *
 * The endpoint is public and production-only. A dev build, a test run, the web
 * console and mobile must never query it: they would offer an operator a
 * desktop installer they cannot apply, and would make every developer's machine
 * a source of update traffic. `forceEnabled` exists so the flow can still be
 * exercised on purpose, never by accident.
 */
export function shouldEnableUpdates(env: UpdateEnvironment): boolean {
  if (env.forceEnabled) return env.isTauri;
  if (!env.isTauri) return false;
  if (env.isDevServer) return false;
  return env.buildEnvironment === 'production';
}

/** True inside the packaged desktop shell. */
export function detectTauri(scope: unknown = globalThis): boolean {
  return !!scope && typeof scope === 'object' && '__TAURI_INTERNALS__' in scope;
}
