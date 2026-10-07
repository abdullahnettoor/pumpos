import {
  buildDownloadOptions,
  detectOs,
  type DownloadOption,
  type DesktopDownloads,
} from '@pump/shared';

const DOWNLOADED_KEY = 'pumpos_desktop_downloaded';

export function desktopOptionsForThisBrowser(downloads: DesktopDownloads): DownloadOption[] {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return buildDownloadOptions({ downloads, os: detectOs(userAgent) });
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
