import {
  buildDownloadOptions,
  detectOs,
  type DownloadOption,
  type DesktopDownloads,
} from '@pump/shared';

const DOWNLOADED_KEY = 'pumpos_desktop_downloaded';

/**
 * Chip architecture for Macs, when the browser exposes it. Safari and Firefox
 * hide it, so undefined is the common case and the UI shows both Mac options.
 */
function detectMacArch(nav: Navigator): 'arm64' | 'x64' | undefined {
  const arch = (nav as any).userAgentData?.architecture;
  if (arch === 'arm') return 'arm64';
  if (arch === 'x86') return 'x64';
  return undefined;
}

export function desktopOptionsForThisBrowser(downloads: DesktopDownloads): DownloadOption[] {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return buildDownloadOptions({
    downloads,
    os: detectOs(nav?.userAgent ?? ''),
    macArch: nav ? detectMacArch(nav) : undefined,
  });
}

export function readDesktopDownloaded(): boolean {
  try {
    return localStorage.getItem(DOWNLOADED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markDesktopDownloaded(): void {
  try {
    localStorage.setItem(DOWNLOADED_KEY, '1');
  } catch {
    /* storage blocked */
  }
}

/** Start the installer download straight from its file URL (no GitHub page). */
export function startDownload(url: string): void {
  window.location.assign(url);
}
