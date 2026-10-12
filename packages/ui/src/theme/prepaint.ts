import type { Plugin } from 'vite';
import {
  APPEARANCE_ENABLED,
  STATUS_BAR_STYLES,
  THEME_COLORS,
  THEME_STORAGE_KEY,
} from './config.js';

export interface PrepaintFlags {
  devSwitch: boolean;
  appearanceEnabled: boolean;
}

/**
 * Replaces theme placeholders in `index.html` with build-time values.
 *
 * Keeps the static markup and inline pre-paint script aligned with `config.ts`
 * without maintaining duplicate constants.
 */
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

/** Fills the pre-paint theme script's placeholders in index.html for Vite builds/dev. */
export function themePrepaintPlugin(
  devSwitch: boolean,
  appearanceEnabled = APPEARANCE_ENABLED,
): Plugin {
  return {
    name: 'pump-theme-prepaint',
    transformIndexHtml: (html) => injectThemeFlags(html, { devSwitch, appearanceEnabled }),
  };
}
