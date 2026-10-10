/**
 * Placeholders in `index.html`'s pre-paint theme script, filled at build time
 * (see `vite.config.ts`). The script mirrors `resolveTheme` / `applyTheme` in
 * `theme.ts` so the right class and theme-color are in place before first
 * paint; `prepaint.test.ts` pins the two against each other.
 */
export interface PrepaintFlags {
  devSwitch: boolean;
  appearanceEnabled: boolean;
}

export function injectThemeFlags(html: string, flags: PrepaintFlags): string {
  return html
    .replaceAll('__THEME_DEV_SWITCH__', String(flags.devSwitch))
    .replaceAll('__APPEARANCE_ENABLED__', String(flags.appearanceEnabled));
}
