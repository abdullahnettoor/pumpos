import React from 'react';
import { useTheme } from './ThemeProvider.js';
import { THEME_PREFERENCES, type ThemePreference } from './theme.js';

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * System / Light / Dark picker. Built but hidden: it renders nothing while
 * `APPEARANCE_ENABLED` is false (theme/config.ts), so no Appearance control is
 * visible anywhere. When dark mode rolls out, flip the flag and mount this in
 * the Account / More screen (it is currently mounted in MoreScreen).
 */
export const AppearanceControl: React.FC = () => {
  const { appearanceEnabled, preference, setPreference } = useTheme();
  if (!appearanceEnabled) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Appearance</p>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-card-alt p-1"
      >
        {THEME_PREFERENCES.map((p) => {
          const active = preference === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPreference(p)}
              className={`rounded-lg py-1.5 text-xs font-semibold ${
                active ? 'bg-card text-text-high shadow-sm' : 'text-text-muted'
              }`}
            >
              {LABELS[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
};
