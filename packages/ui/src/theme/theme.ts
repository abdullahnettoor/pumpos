import {
  APPEARANCE_ENABLED,
  STATUS_BAR_STYLES,
  THEME_COLORS,
  THEME_DEV_QUERY_PARAM,
  THEME_STORAGE_KEY,
  type ThemeName,
} from './config.js';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = ThemeName;

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'] as const;

/**
 * Injected at build time by vite.config.ts via `define`.
 *
 * True under `vite dev`, or when `VITE_THEME_DEV_SWITCH=true` was set at build
 * time; false in production builds.
 */
declare const __PUMP_THEME_DEV_SWITCH__: boolean | undefined;

export const DEV_SWITCH_ENABLED: boolean =
  typeof __PUMP_THEME_DEV_SWITCH__ !== 'undefined' && __PUMP_THEME_DEV_SWITCH__ === true;

export function parsePreference(value: unknown): ThemePreference | null {
  if (value === 'system' || value === 'light' || value === 'dark') return value;
  return null;
}

/**
 * Reads an explicit `?theme=` override from a query string.
 *
 * Returns null if the dev switch is disabled, if the parameter is absent, or
 * if it holds an unrecognized value (e.g. `system` — the dev switch only
 * forces a concrete theme).
 */
export function readDevForce(search: string, devSwitchEnabled: boolean): ResolvedTheme | null {
  if (!devSwitchEnabled) return null;
  const params = new URLSearchParams(search);
  const raw = params.get(THEME_DEV_QUERY_PARAM);
  if (raw === 'light' || raw === 'dark') return raw;
  return null;
}

export interface ResolveThemeInput {
  preference: ThemePreference;
  systemDark: boolean;
  appearanceEnabled?: boolean;
  devForce?: ResolvedTheme | null;
}

/**
 * Pure theme resolution.
 *
 * Order of precedence:
 *   1. Dev force (`?theme=dark|light`, only when the dev switch is enabled).
 *   2. Light, unconditionally, while Appearance is disabled.
 *   3. If Appearance is enabled:
 *        - 'dark'  -> dark
 *        - 'light' -> light
 *        - 'system' -> dark if OS prefers dark, else light.
 */
export function resolveTheme({
  preference,
  systemDark,
  appearanceEnabled = APPEARANCE_ENABLED,
  devForce = null,
}: ResolveThemeInput): ResolvedTheme {
  if (devForce) return devForce;
  if (!appearanceEnabled) return 'light';
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemDark ? 'dark' : 'light';
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads the stored preference safely. Falls back to 'system' on any error
 * (e.g. private browsing storage access denied, SSR, malformed value).
 * Backwards-compatible with legacy `pump.mobile.theme` key.
 */
export function readStoredPreference(storage: StorageLike | null | undefined): ThemePreference {
  try {
    const val = storage?.getItem(THEME_STORAGE_KEY);
    const parsed = parsePreference(val);
    if (parsed) return parsed;
    const legacy = parsePreference(storage?.getItem('pump.mobile.theme'));
    if (legacy) return legacy;
    return 'system';
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
    /* ignore write failures in restricted environments */
  }
}

/**
 * Applies the resolved theme to the document.
 *
 * Sets the `light` or `dark` class and `color-scheme` style on `<html>`, and
 * syncs `meta[name="theme-color"]` and `meta[name="apple-mobile-web-app-status-bar-style"]`.
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
