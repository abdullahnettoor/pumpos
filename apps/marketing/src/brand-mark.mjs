/**
 * The one parser for the canonical PumpOS mark.
 *
 * This site is not an npm workspace and has its own lockfile, so it cannot
 * import the shared UI package — it receives the artwork by file copy from
 * `npm run brand` instead. Reading that copy, rather than pasting its path data
 * into a component, is what keeps the site honest: there is nothing to forget
 * to update. The mark was previously duplicated across a component, a
 * design-review page and twice inside the social-image script, and they had
 * already drifted apart by the time anyone noticed.
 *
 * Deliberately free of Node globals: the component inlines the artwork through
 * the bundler and the social-image script reads it off disk, so only the
 * parsing is shared.
 */

/** Where the fan-out puts the artwork, relative to the site root. */
export const MARK_FILE = 'public/brand/pumpos-mark.svg';

/**
 * @param {string} svg - the artwork's source
 * @param {string} [source] - what to name in the error, if it cannot be read
 * @returns {{ viewBox: string, path: string }}
 */
export function parseBrandMark(svg, source = MARK_FILE) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)];

  // Artwork that cannot be drawn has to stop the build rather than ship a blank
  // header. Exactly one path, not merely a first one: the mark is a single
  // compound path whose nozzle is a knockout, so a second path means the file
  // is not the mark we think it is — and taking the first would silently ship
  // half of it, which is the failure this check exists to prevent.
  if (!viewBox || paths.length !== 1) {
    throw new Error(
      `Could not read ${source}: expected exactly one <path> with a viewBox, ` +
        `found ${paths.length} path(s)${viewBox ? '' : ' and no viewBox'}. ` +
        `Run \`npm run brand\` from the repo root to restore it.`,
    );
  }

  return { viewBox, path: paths[0][1] };
}
