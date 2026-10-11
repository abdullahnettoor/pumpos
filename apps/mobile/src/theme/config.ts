/**
 * Theme configuration constants.
 *
 * Kept free of `import.meta.env` / DOM access so `vite.config.ts` (which runs
 * in Node) and tests can import it directly. This is the single home of every
 * value shared between the app, the pre-paint script and the build.
 */

export type ThemeName = 'light' | 'dark';

/**
 * Appearance (System / Light / Dark) is built but NOT shipped: while `false`
 * the app always renders Light, the stored preference is ignored and no
 * Appearance control is rendered. Flip to `true` only when dark mode rolls out
 * across desktop, console and mobile together.
 */
export const APPEARANCE_ENABLED = false;

/** localStorage key for the per-device theme preference. */
export const THEME_STORAGE_KEY = 'pump.mobile.theme';

/** Query param honoured by the dev-only switch (`?theme=dark`). */
export const THEME_DEV_QUERY_PARAM = 'theme';

/**
 * `<meta name="theme-color">` per theme: the canvas colour, so the browser /
 * status bar chrome blends with the screen. Mirrors `--background` in
 * tokens.css (pinned by tokens.test.ts). Changing a colour = this + tokens.css.
 */
export const THEME_COLORS: Record<ThemeName, string> = {
  light: '#f6f7f4',
  dark: '#0b0f0d',
};

/**
 * `apple-mobile-web-app-status-bar-style` per theme (iOS standalone). The
 * status bar text must contrast with the canvas: `default` is dark text (Light);
 * `black-translucent` is white text over the content (Dark). iOS reads this when
 * the installed app launches, so a change applies from the next launch.
 */
export const STATUS_BAR_STYLES: Record<ThemeName, string> = {
  light: 'default',
  dark: 'black-translucent',
};

/**
 * The one definition of "is the dev-only dark switch available in this build".
 * `vite.config.ts` evaluates it once and uses the result for both the pre-paint
 * script and the app (via `define`), so the two can never disagree.
 *
 * On in `vite dev` (`serve`); in a build only when `VITE_THEME_DEV_SWITCH=true`
 * (e.g. a preview deploy). Never on for a normal production build.
 */
export function isDevSwitchEnabled(command: 'serve' | 'build', optIn: string | undefined): boolean {
  return command === 'serve' || optIn === 'true';
}
