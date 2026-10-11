/**
 * Mobile theme model (pure, no React).
 *
 * - A *preference* is what the user chose: System / Light / Dark.
 * - A *resolved theme* is what actually renders: Light or Dark.
 * - The resolved theme is applied as a `light` / `dark` class on `<html>` (the
 *   app root) so the semantic tokens in `tokens.css` switch value sets.
 *
 * Policy: while `APPEARANCE_ENABLED` is false the app is always Light. The
 * only way to see Dark is the dev-only switch (`?theme=dark`), which exists so
 * the dark token set can be verified before dark mode ships.
 */
import {
  STATUS_BAR_STYLES,
  THEME_COLORS,
  THEME_DEV_QUERY_PARAM,
  THEME_STORAGE_KEY,
  type ThemeName,
} from './config.js';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = ThemeName;

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * Whether the dev-only dark switch is available in this build. The rule lives
 * in `isDevSwitchEnabled` (config.ts); `vite.config.ts` evaluates it once and
 * injects the result both into the pre-paint script and here (via `define`).
 * Off when the define is absent (e.g. under vitest).
 */
declare const __PUMP_THEME_DEV_SWITCH__: boolean | undefined;
export const DEV_SWITCH_ENABLED: boolean =
  typeof __PUMP_THEME_DEV_SWITCH__ !== 'undefined' && __PUMP_THEME_DEV_SWITCH__ === true;

export function parsePreference(value: unknown): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

/** `?theme=dark|light` → the forced theme, or null (also null when the switch is off). */
export function readDevForce(search: string, devSwitchEnabled: boolean): ResolvedTheme | null {
  if (!devSwitchEnabled) return null;
  const value = new URLSearchParams(search).get(THEME_DEV_QUERY_PARAM);
  return value === 'light' || value === 'dark' ? value : null;
}

export interface ResolveThemeInput {
  preference: ThemePreference;
  systemDark: boolean;
  appearanceEnabled: boolean;
  /** Dev-only override; wins over everything. */
  devForce?: ResolvedTheme | null;
}

export function resolveTheme({
  preference,
  systemDark,
  appearanceEnabled,
  devForce = null,
}: ResolveThemeInput): ResolvedTheme {
  if (devForce) return devForce;
  if (!appearanceEnabled) return 'light';
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Stored per-device preference; `system` when nothing (valid) is stored. */
export function readStoredPreference(storage: StorageLike | null | undefined): ThemePreference {
  try {
    return parsePreference(storage?.getItem(THEME_STORAGE_KEY)) ?? 'system';
  } catch {
    return 'system';
  }
}

export function writeStoredPreference(
  storage: StorageLike | null | undefined,
  preference: ThemePreference,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode / quota: the preference just won't persist */
  }
}

/**
 * Applies a resolved theme to the document: root class, color-scheme, the
 * theme-color meta and the iOS status-bar style (so its text contrasts with
 * the canvas). Mirrored before first paint by the script in index.html.
 */
export function applyTheme(doc: Document, theme: ResolvedTheme): void {
  const root = doc.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;

  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];

  let bar = doc.querySelector<HTMLMetaElement>(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
  );
  if (!bar) {
    bar = doc.createElement('meta');
    bar.name = 'apple-mobile-web-app-status-bar-style';
    doc.head.appendChild(bar);
  }
  bar.content = STATUS_BAR_STYLES[theme];
}
