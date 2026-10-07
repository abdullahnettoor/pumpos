import { describe, expect, it } from 'vitest';
import {
  buildDownloadOptions,
  detectOs,
  resolveDesktopDownloads,
  type GithubReleaseLike,
} from './desktop-downloads.js';

const asset = (name: string, size = 1000) => ({
  name,
  size,
  browser_download_url: `https://dl/${name}`,
});
const full = (v: string): GithubReleaseLike => ({
  tag_name: `v${v}`,
  assets: [
    asset(`PumpOS_${v}_x64-setup.exe`),
    asset(`PumpOS_${v}_aarch64.dmg`),
    asset(`PumpOS_${v}_x64.dmg`),
    asset(`PumpOS_${v}_x64-setup.exe.sig`),
    asset('latest.json'),
    asset('PumpOS_aarch64.app.tar.gz'),
  ],
});

describe('resolveDesktopDownloads', () => {
  it('uses the newest release when it has every installer', () => {
    const d = resolveDesktopDownloads([full('1.6.0'), full('1.5.0')]);
    expect(d['windows-x64']).toMatchObject({ available: true, version: '1.6.0', isLatest: true });
    expect(d['macos-arm64']).toMatchObject({
      version: '1.6.0',
      url: 'https://dl/PumpOS_1.6.0_aarch64.dmg',
    });
  });

  it('falls back per platform to an older release', () => {
    const winOnly: GithubReleaseLike = {
      tag_name: 'v1.6.0',
      assets: [asset('PumpOS_1.6.0_x64-setup.exe')],
    };
    const d = resolveDesktopDownloads([winOnly, full('1.5.0')]);
    expect(d['windows-x64']).toMatchObject({ version: '1.6.0', isLatest: true });
    expect(d['macos-arm64']).toMatchObject({ version: '1.5.0', isLatest: false });
  });

  it('reports not available when no release has the platform', () => {
    const winOnly: GithubReleaseLike = {
      tag_name: 'v1.6.0',
      assets: [asset('PumpOS_1.6.0_x64-setup.exe')],
    };
    expect(resolveDesktopDownloads([winOnly])['macos-x64']).toEqual({ available: false });
  });

  it('ignores drafts and prereleases', () => {
    const d = resolveDesktopDownloads([
      { ...full('1.7.0'), draft: true },
      { ...full('1.6.1-rc.1'), prerelease: true },
      full('1.6.0'),
    ]);
    expect(d['windows-x64']).toMatchObject({ version: '1.6.0', isLatest: true });
  });

  it('never offers signatures or updater files as installers', () => {
    const only: GithubReleaseLike = {
      tag_name: 'v1.6.0',
      assets: [
        asset('PumpOS_1.6.0_x64-setup.exe.sig'),
        asset('latest.json'),
        asset('PumpOS_aarch64.app.tar.gz'),
      ],
    };
    const d = resolveDesktopDownloads([only]);
    expect(Object.values(d).every((x) => !x.available)).toBe(true);
  });
});

describe('detectOs', () => {
  it('maps user agents', () => {
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other');
  });
});

describe('buildDownloadOptions', () => {
  const downloads = resolveDesktopDownloads([full('1.6.0')]);
  it('recommends Windows first for a Windows user', () => {
    const o = buildDownloadOptions({ downloads, os: 'windows' });
    expect(o[0]).toMatchObject({ platform: 'windows-x64', recommended: true });
    expect(o.filter((x) => x.recommended)).toHaveLength(1);
  });
  it('recommends the known Mac arch only', () => {
    const o = buildDownloadOptions({ downloads, os: 'macos', macArch: 'arm64' });
    expect(o[0].platform).toBe('macos-arm64');
    expect(o.filter((x) => x.recommended)).toHaveLength(1);
  });
  it('recommends both Macs with a hint when the chip is unknown', () => {
    const o = buildDownloadOptions({ downloads, os: 'macos' });
    expect(o.filter((x) => x.recommended).map((x) => x.platform)).toEqual([
      'macos-arm64',
      'macos-x64',
    ]);
    expect(o[0].hint).toBeTruthy();
    expect(o[2].hint).toBeUndefined();
  });
  it('recommends nothing for Linux or unknown', () => {
    expect(buildDownloadOptions({ downloads, os: 'other' }).some((x) => x.recommended)).toBe(false);
  });
  it('keeps unavailable platforms in the list', () => {
    const d = resolveDesktopDownloads([]);
    expect(buildDownloadOptions({ downloads: d, os: 'windows' })).toHaveLength(3);
  });
});
