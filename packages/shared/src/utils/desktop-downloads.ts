/**
 * Desktop installer discovery, shared by the API (which resolves GitHub
 * Releases into per-platform downloads) and the console (which turns that into
 * options for the user's OS). Pure: no fetch, no React.
 */

export const DESKTOP_PLATFORMS = ['windows-x64', 'macos-arm64', 'macos-x64'] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

export const DESKTOP_PLATFORM_LABELS: Record<DesktopPlatform, string> = {
  'windows-x64': 'Windows',
  'macos-arm64': 'macOS (Apple Silicon)',
  'macos-x64': 'macOS (Intel)',
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
  if (lower.endsWith('.dmg')) {
    if (lower.includes('aarch64') || lower.includes('arm64')) return 'macos-arm64';
    if (lower.includes('x64') || lower.includes('x86_64')) return 'macos-x64';
  }
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
  const newestTag = published[0]?.tag_name;
  const result = Object.fromEntries(
    DESKTOP_PLATFORMS.map((p) => [p, { available: false } as DesktopDownload]),
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
  /** Shown on both Mac options when the chip is unknown. */
  hint?: string;
}

export interface BuildDownloadOptionsInput {
  downloads: DesktopDownloads;
  os: DetectedOs;
  /** Known only when the browser exposes it; undefined means "can't tell". */
  macArch?: 'arm64' | 'x64';
}

const MAC_HINT = 'Apple menu → About This Mac shows your chip.';

/**
 * Ordered download options: the recommended platform(s) first, then the rest in
 * a stable order. An unknown Mac chip recommends both Mac options with a hint
 * rather than guessing.
 */
export function buildDownloadOptions({
  downloads,
  os,
  macArch,
}: BuildDownloadOptionsInput): DownloadOption[] {
  const recommendedPlatforms: DesktopPlatform[] =
    os === 'windows'
      ? ['windows-x64']
      : os === 'macos'
        ? macArch === 'arm64'
          ? ['macos-arm64']
          : macArch === 'x64'
            ? ['macos-x64']
            : ['macos-arm64', 'macos-x64']
        : [];
  const bothMacs = os === 'macos' && !macArch;

  const options = DESKTOP_PLATFORMS.map<DownloadOption>((platform) => ({
    platform,
    label: DESKTOP_PLATFORM_LABELS[platform],
    download: downloads[platform],
    recommended: recommendedPlatforms.includes(platform),
    ...(bothMacs && platform.startsWith('macos') ? { hint: MAC_HINT } : {}),
  }));

  return [...options.filter((o) => o.recommended), ...options.filter((o) => !o.recommended)];
}

/** Human file size, e.g. "84.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
