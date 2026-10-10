import React, { useRef } from 'react';
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
 *
 * Keyboard: a radiogroup with a roving tabindex (one Tab stop, on the checked
 * option); arrow keys move and select, Home / End jump to the ends.
 */
export const AppearanceControl: React.FC = () => {
  const { appearanceEnabled, preference, setPreference } = useTheme();
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  if (!appearanceEnabled) return null;

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = THEME_PREFERENCES.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = THEME_PREFERENCES[next];
    setPreference(target);
    buttons.current[target]?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Appearance</p>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-card-alt p-1"
      >
        {THEME_PREFERENCES.map((p, i) => {
          const active = preference === p;
          return (
            <button
              key={p}
              ref={(el) => {
                buttons.current[p] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setPreference(p)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`rounded-lg py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? 'bg-card text-text-high shadow-chip' : 'text-text-muted'
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
