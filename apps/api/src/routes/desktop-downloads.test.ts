import { describe, expect, it, vi } from 'vitest';
import type { GithubReleaseLike } from '@pump/shared';
import { createDesktopDownloadsService } from '../services/desktop-downloads.js';
import { createDesktopDownloadsRouter } from './desktop-downloads.js';

const release: GithubReleaseLike = {
  tag_name: 'v1.6.0',
  assets: [{ name: 'PumpOS_1.6.0_x64-setup.exe', size: 5, browser_download_url: 'https://dl/x' }],
};

describe('desktop downloads service', () => {
  it('caches within the TTL', async () => {
    const fetchReleases = vi.fn().mockResolvedValue([release]);
    let t = 0;
    const svc = createDesktopDownloadsService(fetchReleases, () => t);
    await svc.get();
    t = 60_000;
    await svc.get();
    expect(fetchReleases).toHaveBeenCalledTimes(1);
  });

  it('serves the last cached value when GitHub fails after expiry', async () => {
    const fetchReleases = vi
      .fn()
      .mockResolvedValueOnce([release])
      .mockRejectedValue(new Error('403'));
    let t = 0;
    const svc = createDesktopDownloadsService(fetchReleases, () => t);
    await svc.get();
    t = 10 * 60_000;
    const value = await svc.get();
    expect(value['windows-x64']).toMatchObject({ available: true, version: '1.6.0' });
  });

  it('backs off after a failure instead of asking GitHub on every request', async () => {
    const fetchReleases = vi
      .fn()
      .mockResolvedValueOnce([release])
      .mockRejectedValueOnce(new Error('403'))
      .mockResolvedValue([release]);
    let t = 0;
    const svc = createDesktopDownloadsService(fetchReleases, () => t);
    await svc.get();
    t = 10 * 60_000;
    await svc.get(); // fails, serves cache
    t += 30_000;
    await svc.get(); // within back-off: cache, no GitHub call
    expect(fetchReleases).toHaveBeenCalledTimes(2);
    t += 60_000;
    await svc.get(); // back-off over: asks again
    expect(fetchReleases).toHaveBeenCalledTimes(3);
  });

  it('throws when GitHub fails and nothing is cached', async () => {
    const svc = createDesktopDownloadsService(vi.fn().mockRejectedValue(new Error('403')));
    await expect(svc.get()).rejects.toThrow();
  });
});

describe('GET /desktop-downloads', () => {
  it('returns the envelope with per-platform data', async () => {
    const app = createDesktopDownloadsRouter(createDesktopDownloadsService(async () => [release]));
    const res = await app.request('/');
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.macos).toEqual({ available: false });
    expect(body.data['windows-x64'].url).toBe('https://dl/x');
  });

  it('returns a typed 503 when nothing is cached and GitHub fails', async () => {
    const app = createDesktopDownloadsRouter(
      createDesktopDownloadsService(async () => {
        throw new Error('down');
      }),
    );
    const res = await app.request('/');
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error.code).toBe('DOWNLOADS_UNAVAILABLE');
  });
});
