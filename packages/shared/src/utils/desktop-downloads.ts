/**
 * Desktop installer discovery, shared by the API (which resolves GitHub
 * Releases into per-platform downloads) and the console (which turns that into
 * options for the user's OS). Pure: no fetch, no React.
 */

export const DESKTOP_PLATFORMS = ['windows-x64', 'macos'] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

export const DESKTOP_PLATFORM_LABELS: Record<DesktopPlatform, string> = {
  'windows-x64': 'Windows',
  // One universal build runs on both Apple Silicon and Intel Macs.
  macos: 'macOS',
};

/** The slice of a GitHub release this module needs. */
export interface GithubReleaseLike {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: ReadonlyArray<{ name: string; size: number; browser_download_url: string }>;
}

export type DesktopDownload =
  | { available: false }
  | {
      available: true;
      version: string;
      sizeBytes: number;
      url: string;
      /** False when this platform's installer comes from an older release. */
      isLatest: boolean;
    };

export type DesktopDownloads = Record<DesktopPlatform, DesktopDownload>;

/** Map an asset file name to the platform whose installer it is, if any. */
export function platformForAsset(name: string): DesktopPlatform | null {
  const lower = name.toLowerCase();
  // Updater payloads and signatures are never installers.
  if (lower.endsWith('.sig') || lower.endsWith('.json') || lower.endsWith('.tar.gz')) return null;
  if (lower.endsWith('-setup.exe')) return 'windows-x64';
  // Releases ship one universal .dmg for every Mac.
  if (lower.endsWith('.dmg')) return 'macos';
  return null;
}

const stripV = (tag: string) => tag.replace(/^v/i, '');

/**
 * Per platform, pick the newest published release that carries its installer.
 * `releases` must be newest-first (GitHub's order). Drafts and prereleases are
 * ignored, so an unapproved build is never offered.
 */
export function resolveDesktopDownloads(
  releases: ReadonlyArray<GithubReleaseLike>,
): DesktopDownloads {
  const published = releases.filter((r) => !r.draft && !r.prerelease);
  // "Latest" is the newest release that ships any installer, so a release with
  // no installers at all doesn't mark every platform as a fallback.
  const newestTag = published.find((r) =>
    r.assets.some((a) => platformForAsset(a.name) !== null),
  )?.tag_name;
  const result = Object.fromEntries(
    DESKTOP_PLATFORMS.map((p) => [p, { available: false }]),
  ) as DesktopDownloads;

  for (const platform of DESKTOP_PLATFORMS) {
    for (const release of published) {
      const asset = release.assets.find((a) => platformForAsset(a.name) === platform);
      if (!asset) continue;
      result[platform] = {
        available: true,
        version: stripV(release.tag_name),
        sizeBytes: asset.size,
        url: asset.browser_download_url,
        isLatest: release.tag_name === newestTag,
      };
      break;
    }
  }
  return result;
}

export type DetectedOs = 'windows' | 'macos' | 'other';

/** Best-effort OS detection from the browser's user agent. Linux/unknown → other. */
export function detectOs(userAgent: string): DetectedOs {
  if (/windows/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
  return 'other';
}

export interface DownloadOption {
  platform: DesktopPlatform;
  label: string;
  download: DesktopDownload;
  recommended: boolean;
}

/** Ordered download options: the platform for this OS first, then the rest. */
export function buildDownloadOptions({
  downloads,
  os,
}: {
  downloads: DesktopDownloads;
  os: DetectedOs;
}): DownloadOption[] {
  const recommendedPlatform: DesktopPlatform | null =
    os === 'windows' ? 'windows-x64' : os === 'macos' ? 'macos' : null;

  const options = DESKTOP_PLATFORMS.map<DownloadOption>((platform) => ({
    platform,
    label: DESKTOP_PLATFORM_LABELS[platform],
    download: downloads[platform],
    recommended: platform === recommendedPlatform,
  }));

  return [...options.filter((o) => o.recommended), ...options.filter((o) => !o.recommended)];
}

/** Human file size, e.g. "84.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
