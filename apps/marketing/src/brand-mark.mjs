/**
 * The one parser for the canonical PumpOS mark.
 *
 * This site is not an npm workspace and has its own lockfile, so it cannot
 * import the shared UI package — it receives `brand/pumpos-mark.svg` by file
 * copy from `npm run brand` instead. Reading that copy, rather than pasting its
 * path data into a component, is what keeps the site honest: there is nothing
 * to forget to update. The previous mark was duplicated across a component, a
 * design-review page and twice inside the social-image script, and they had
 * already drifted apart by the time anyone noticed.
 *
 * Deliberately free of Node globals: the component inlines the artwork through
 * the bundler and the social-image script reads it off disk, so only the
 * parsing is shared.
 */
export function parseBrandMark(svg, source = 'the PumpOS mark') {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const path = /<path d="([^"]+)"/.exec(svg)?.[1];

  // A silently empty mark would sail through the build and ship a blank header,
  // so unreadable artwork has to stop the build instead.
  if (!viewBox || !path) {
    throw new Error(
      `Could not read ${source}: expected a single <path> with a viewBox. ` +
        `Run \`npm run brand\` from the repo root to restore it.`,
    );
  }

  return { viewBox, path };
}
