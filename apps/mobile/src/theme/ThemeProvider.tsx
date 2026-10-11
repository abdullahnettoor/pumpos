import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { APPEARANCE_ENABLED } from './config.js';
import {
  DEV_SWITCH_ENABLED,
  applyTheme,
  readDevForce,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
  type ThemePreference,
} from './theme.js';

export interface ThemeContextValue {
  /** What the user chose (stored per device). Ignored while appearance is disabled. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** False while Appearance is not shipped: always Light, no control. */
  appearanceEnabled: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function useSystemDark(active: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active || typeof matchMedia !== 'function') return () => {};
      const mql = matchMedia(DARK_QUERY);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [active],
  );
  return useSyncExternalStore(
    subscribe,
    () => active && typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Overrides for tests; production uses the build-time config. */
  appearanceEnabled?: boolean;
  devSwitchEnabled?: boolean;
}

/**
 * Owns the theme preference and keeps `<html>` in sync with it. The pre-paint
 * script in index.html already set the right class; this takes over after
 * mount (preference changes, OS scheme changes while on System).
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  appearanceEnabled = APPEARANCE_ENABLED,
  devSwitchEnabled = DEV_SWITCH_ENABLED,
}) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(typeof localStorage === 'undefined' ? null : localStorage),
  );
  const [devForce] = useState(() =>
    typeof location === 'undefined' ? null : readDevForce(location.search, devSwitchEnabled),
  );
  const systemDark = useSystemDark(appearanceEnabled && preference === 'system');

  const resolved = resolveTheme({ preference, systemDark, appearanceEnabled, devForce });

  useLayoutEffect(() => {
    applyTheme(document, resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStoredPreference(typeof localStorage === 'undefined' ? null : localStorage, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference,
      appearanceEnabled,
    }),
    [preference, setPreference, appearanceEnabled],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
