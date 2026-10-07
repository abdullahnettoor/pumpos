import {
  resolveDesktopDownloads,
  type DesktopDownloads,
  type GithubReleaseLike,
} from '@pump/shared';

/** Port: newest-first published-or-not releases from GitHub. */
export type FetchReleases = () => Promise<GithubReleaseLike[]>;

export const DESKTOP_RELEASES_REPO = 'abdullahnettoor/pumpos';
const CACHE_TTL_MS = 5 * 60 * 1000;
const SCAN_WINDOW = 15;

export const fetchGithubReleases: FetchReleases = async () => {
  const res = await fetch(
    `https://api.github.com/repos/${DESKTOP_RELEASES_REPO}/releases?per_page=${SCAN_WINDOW}`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'pumpos-api' } },
  );
  if (!res.ok) throw new Error(`GitHub releases request failed (${res.status})`);
  const releases: GithubReleaseLike[] = await res.json();
  return releases;
};

export interface DesktopDownloadsService {
  get(): Promise<DesktopDownloads>;
}

/**
 * Resolve downloads from GitHub Releases, cached for a few minutes. On a GitHub
 * failure the last cached value is served (even if stale); with no cache the
 * error propagates so the route can return a typed failure.
 */
export function createDesktopDownloadsService(
  fetchReleases: FetchReleases,
  now: () => number = Date.now,
): DesktopDownloadsService {
  let cached: { at: number; value: DesktopDownloads } | null = null;
  return {
    async get() {
      if (cached && now() - cached.at < CACHE_TTL_MS) return cached.value;
      try {
        const value = resolveDesktopDownloads(await fetchReleases());
        cached = { at: now(), value };
        return value;
      } catch (err) {
        if (cached) return cached.value;
        throw err;
      }
    },
  };
}
