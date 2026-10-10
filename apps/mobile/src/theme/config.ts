/**
 * Theme configuration constants.
 *
 * Kept free of `import.meta.env` / DOM access so `vite.config.ts` and tests can
 * import it directly.
 */

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
