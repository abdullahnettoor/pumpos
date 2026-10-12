export type ThemeName = 'light' | 'dark';

/**
 * Dark mode rollout gate (#389, #501).
 *
 * Ships `false`: the UI has no Appearance control, stored preferences are
 * ignored, and the app always renders Light. Flipping this to `true` exposes
 * the control and respects the user's choice.
 *
 * (The dev-only switch `?theme=dark` bypasses this when enabled; see
 * isDevSwitchEnabled.)
 */
export const APPEARANCE_ENABLED = false;

/**
 * LocalStorage key for the user's chosen ThemePreference.
 *
 * Per-device, shared across mobile, web, and desktop.
 */
export const THEME_STORAGE_KEY = 'pump.theme';

/** Query-string parameter used by the dev-only switch. */
export const THEME_DEV_QUERY_PARAM = 'theme';

/**
 * Screen canvas colour applied to the HTML document / status bar background.
 *
 * Inlined so the pre-paint script in index.html can set `meta[name="theme-color"]`
 * before CSS parses, without duplicating the hex value.
 */
export const THEME_COLORS: Record<ThemeName, string> = {
  light: '#f6f7f4',
  dark: '#0b0f0d',
};

/**
 * iOS status bar style for standalone PWA mode.
 *
 * Light: 'default' (dark text on light background).
 * Dark: 'black-translucent' (white text, content under status bar).
 */
export const STATUS_BAR_STYLES: Record<ThemeName, string> = {
  light: 'default',
  dark: 'black-translucent',
};

/**
 * Decides whether the `?theme=dark` dev-switch is permitted.
 *
 * - Under `vite dev` (`serve` command): always on, so designers and engineers
 *   can view dark mode without rebuilding.
 * - Under `vite build`: OFF by default, so production builds ignore the query
 *   parameter. Only turned on in builds with an explicit opt-in env var
 *   `VITE_THEME_DEV_SWITCH=true` (e.g. for a preview deployment).
 */
export function isDevSwitchEnabled(command: 'serve' | 'build', optIn: string | undefined): boolean {
  return command === 'serve' || optIn === 'true';
}
