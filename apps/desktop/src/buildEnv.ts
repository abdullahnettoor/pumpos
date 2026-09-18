/**
 * Build-time environment resolution for the desktop shell.
 *
 * A packaged Tauri app serves its frontend over a custom protocol whose host is
 * `localhost` in EVERY build, forever. Sniffing `window.location.hostname` can
 * tell environments apart in a browser; inside the desktop shell it only ever
 * says "local", which is how a production install ended up wearing a yellow
 * LOCAL badge (#116). So the desktop resolves its environment purely from the
 * value baked into the bundle at build time — `VITE_APP_ENV` — and never from
 * the host it happens to be served from.
 *
 * The web console keeps its hostname fallback: there the hostname genuinely
 * varies per deployment.
 *
 * `apps/desktop/vite.config.ts` fails the build when a packaged (Tauri) release
 * build is missing `VITE_APP_ENV`, so "no badge" always means production rather
 * than "nobody set the variable".
 */

export type BuildEnvironment = 'development' | 'dev' | 'preview' | 'production';

/** Badge text for an environment. Production is deliberately unbadged. */
export type EnvironmentTag = 'Local' | 'Dev' | 'Preview' | null;

const TAGS: Record<BuildEnvironment, EnvironmentTag> = {
  development: 'Local',
  dev: 'Dev',
  preview: 'Preview',
  production: null,
};

/**
 * Normalise the raw `VITE_APP_ENV` value.
 *
 * `isDevServer` is `import.meta.env.DEV` — true only while the Vite dev server
 * is driving the app, which no packaged build ever is. An unset or unrecognised
 * value in a packaged build resolves to `production`: the vite config already
 * refused to produce such a bundle, so treating the leftover case as production
 * fails safe (no badge, no developer-only pages) rather than mislabelling a
 * real install.
 */
export function resolveBuildEnvironment(
  rawAppEnv: string | undefined,
  isDevServer: boolean,
): BuildEnvironment {
  const value = rawAppEnv?.trim().toLowerCase();
  if (value === 'development' || value === 'local') return 'development';
  if (value === 'dev') return 'dev';
  if (value === 'preview') return 'preview';
  if (value === 'production' || value === 'prod') return 'production';
  return isDevServer ? 'development' : 'production';
}

export function environmentTagFor(environment: BuildEnvironment): EnvironmentTag {
  return TAGS[environment];
}

/** Developer-only surfaces (the Design System reference page) are local-only. */
export function showsDeveloperSurfaces(environment: BuildEnvironment): boolean {
  return environment === 'development';
}

export const buildEnvironment = resolveBuildEnvironment(
  import.meta.env.VITE_APP_ENV as string | undefined,
  import.meta.env.DEV,
);

export const environmentTag = environmentTagFor(buildEnvironment);

export const showDeveloperSurfaces = showsDeveloperSurfaces(buildEnvironment);
