/**
 * Which API a command is aimed at.
 *
 * The target is part of the UI rather than a build-time variable because a
 * platform admin flips between environments constantly, and restarting Vite to
 * do that is exactly the friction this app exists to remove. The consequence is
 * that the current target must be visible on every screen — see `TargetBar`.
 */
export interface ApiTarget {
  id: string;
  label: string;
  url: string;
  /** Production targets get the loud treatment in the UI. */
  production: boolean;
}

export const API_TARGETS: ApiTarget[] = [
  { id: 'local', label: 'Local', url: 'http://localhost:8787', production: false },
  {
    id: 'dev',
    label: 'Dev',
    url: 'https://api.pumpos.abdullahnettoor.com',
    production: false,
  },
  { id: 'prod', label: 'Production', url: 'https://api.pumpos.app', production: true },
];

/**
 * Both environments authenticate against the same Supabase project (see
 * `apps/api/wrangler.toml`), so the sign-in config is target-independent.
 * Defaults match the anon client in `@pump/ui`; override per machine via env.
 */
export const SUPABASE_URL = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://gpfqiesflrpmndhkfvhg.supabase.co'
).replace(/\/$/, '');

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  'sb_publishable_mMyWNusxZtScUxjTOD9fVA_ViTJ5Gvg';

const TARGET_STORAGE_KEY = 'pumpos.platform.target';

/**
 * The selected target survives a reload (the session deliberately does not):
 * re-picking the environment on every refresh is the kind of repeated step this
 * app replaces, and the choice itself grants no access.
 */
export function loadStoredTarget(): ApiTarget {
  const stored =
    typeof localStorage !== 'undefined' ? localStorage.getItem(TARGET_STORAGE_KEY) : null;
  return API_TARGETS.find((t) => t.id === stored) ?? API_TARGETS[0];
}

export function storeTarget(target: ApiTarget): void {
  try {
    localStorage.setItem(TARGET_STORAGE_KEY, target.id);
  } catch {
    // Private-mode / blocked storage: the switcher still works for this session.
  }
}
