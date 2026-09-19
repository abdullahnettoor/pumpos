import { describe, expect, it, vi } from 'vitest';
import { STABLE_MANIFEST_URL, smokeUpdaterManifest } from './smoke-updater.mjs';

const BASE = 'https://github.com/abdullahnettoor/pumpos/releases/download/v1.2.3';

const MANIFEST = {
  version: '1.2.3',
  notes: 'Fixes drawer reconciliation rounding.',
  pub_date: '2026-05-01T00:00:00.000Z',
  platforms: {
    'darwin-universal': { signature: 'bWFj', url: `${BASE}/PumpOS.app.tar.gz` },
    'windows-x86_64': { signature: 'd2lu', url: `${BASE}/PumpOS_1.2.3_x64-setup.exe` },
  },
};

/** Serves the manifest, then whatever each asset URL is configured to answer. */
function fakeFetch({ manifest = MANIFEST, assetStatus = {}, manifestStatus = 200 } = {}) {
  return vi.fn(async (url, init = {}) => {
    if (url.endsWith('latest.json')) {
      return {
        ok: manifestStatus < 400,
        status: manifestStatus,
        async json() {
          if (manifest === 'invalid') throw new Error('bad json');
          return manifest;
        },
      };
    }
    const status = assetStatus[url] ?? 200;
    return { ok: status < 400, status, method: init.method };
  });
}

describe('stable update channel smoke check', () => {
  it('defaults to the endpoint installed clients actually poll', () => {
    expect(STABLE_MANIFEST_URL).toBe(
      'https://github.com/abdullahnettoor/pumpos/releases/latest/download/latest.json',
    );
  });

  it('passes when the manifest and every referenced asset are reachable', async () => {
    const fetchImpl = fakeFetch();
    const manifest = await smokeUpdaterManifest({
      url: `${BASE}/latest.json`,
      expectVersion: '1.2.3',
      fetchImpl,
      log: () => {},
    });
    expect(manifest.version).toBe('1.2.3');
    // One manifest fetch plus one HEAD per supported target. No Linux request.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails when the published manifest is missing', async () => {
    await expect(
      smokeUpdaterManifest({ fetchImpl: fakeFetch({ manifestStatus: 404 }), log: () => {} }),
    ).rejects.toThrow(/returned HTTP 404/);
  });

  it('fails when the manifest is not JSON', async () => {
    await expect(
      smokeUpdaterManifest({ fetchImpl: fakeFetch({ manifest: 'invalid' }), log: () => {} }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('fails when the published version is not the one being released', async () => {
    await expect(
      smokeUpdaterManifest({ expectVersion: '1.2.4', fetchImpl: fakeFetch(), log: () => {} }),
    ).rejects.toThrow(/does not match the tag/);
  });

  it('fails when a referenced asset was never uploaded', async () => {
    const fetchImpl = fakeFetch({
      assetStatus: { [`${BASE}/PumpOS_1.2.3_x64-setup.exe`]: 404 },
    });
    await expect(smokeUpdaterManifest({ fetchImpl, log: () => {} })).rejects.toThrow(
      /windows-x86_64 asset is unreachable \(HTTP 404\)/,
    );
  });

  it('falls back to a ranged GET when the host refuses HEAD', async () => {
    const methods = [];
    const fetchImpl = vi.fn(async (url, init = {}) => {
      if (url.endsWith('latest.json')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return MANIFEST;
          },
        };
      }
      methods.push(init.method);
      // A CDN that answers 405 to HEAD is not an outage; only a failing GET is.
      return init.method === 'HEAD' ? { ok: false, status: 405 } : { ok: true, status: 206 };
    });
    await expect(smokeUpdaterManifest({ fetchImpl, log: () => {} })).resolves.toBeTruthy();
    expect(methods).toEqual(['HEAD', 'GET', 'HEAD', 'GET']);
  });
});
