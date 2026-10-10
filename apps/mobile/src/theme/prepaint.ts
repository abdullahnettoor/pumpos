import { STATUS_BAR_STYLES, THEME_COLORS, THEME_STORAGE_KEY } from './config.js';

/**
 * Placeholders in `index.html`'s pre-paint theme script and static markup,
 * filled at build time (see `vite.config.ts`). The script mirrors
 * `resolveTheme` / `applyTheme` in `theme.ts` so the right class, theme-color
 * and status-bar style are in place before first paint; `prepaint.test.ts`
 * pins the two against each other. Colours, the storage key and status-bar
 * styles all come from `config.ts`, so index.html holds no copies of them.
 */
export interface PrepaintFlags {
  devSwitch: boolean;
  appearanceEnabled: boolean;
}

export function injectThemeFlags(html: string, flags: PrepaintFlags): string {
  return html
    .replaceAll('__THEME_DEV_SWITCH__', String(flags.devSwitch))
    .replaceAll('__APPEARANCE_ENABLED__', String(flags.appearanceEnabled))
    .replaceAll('__THEME_STORAGE_KEY__', THEME_STORAGE_KEY)
    .replaceAll('__THEME_COLOR_LIGHT__', THEME_COLORS.light)
    .replaceAll('__THEME_COLOR_DARK__', THEME_COLORS.dark)
    .replaceAll('__STATUS_BAR_LIGHT__', STATUS_BAR_STYLES.light)
    .replaceAll('__STATUS_BAR_DARK__', STATUS_BAR_STYLES.dark);
}
