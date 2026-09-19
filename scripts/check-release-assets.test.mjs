import { describe, expect, it, vi } from 'vitest';
import {
  assertManifestAssetsPresent,
  assertReleaseAssetsReachable,
  assetNameFromUrl,
} from './check-release-assets.mjs';

const BASE = 'https://github.com/abdullahnettoor/pumpos/releases/download/v1.2.3';
const API = 'https://api.github.com/repos/abdullahnettoor/pumpos/releases/assets';

function manifest(overrides = {}) {
  return {
    version: '1.2.3',
    notes: '',
    pub_date: '2026-05-01T00:00:00.000Z',
    platforms: {
      'darwin-aarch64': { signature: 'bWFj', url: `${BASE}/PumpOS.app.tar.gz` },
      'darwin-x86_64': { signature: 'bWFj', url: `${BASE}/PumpOS.app.tar.gz` },
      'windows-x86_64': { signature: 'd2lu', url: `${BASE}/PumpOS_1.2.3_x64-setup.exe` },
    },
    ...overrides,
  };
}

const asset = (name, overrides = {}) => ({
  name,
  size: 1024,
  state: 'uploaded',
  apiUrl: `${API}/${name}`,
  ...overrides,
});

const COMPLETE = [
  asset('PumpOS.app.tar.gz'),
  asset('PumpOS.app.tar.gz.sig'),
  asset('PumpOS_1.2.3_universal.dmg'),
  asset('PumpOS_1.2.3_x64-setup.exe'),
  asset('PumpOS_1.2.3_x64-setup.exe.sig'),
];

describe('release asset presence', () => {
  it('returns the referenced assets when everything is attached', () => {
    expect(assertManifestAssetsPresent(manifest(), COMPLETE).map((a) => a.name)).toEqual([
      'PumpOS.app.tar.gz',
      'PumpOS_1.2.3_x64-setup.exe',
    ]);
  });

  it('fails when a target built but never uploaded', () => {
    const assets = COMPLETE.filter((a) => !a.name.startsWith('PumpOS_1.2.3_x64-setup.exe'));
    expect(() => assertManifestAssetsPresent(manifest(), assets)).toThrow(
      /windows-x86_64 references PumpOS_1\.2\.3_x64-setup\.exe, which is not attached/,
    );
  });

  it('fails when an asset is attached without its signature', () => {
    const assets = COMPLETE.filter((a) => a.name !== 'PumpOS.app.tar.gz.sig');
    expect(() => assertManifestAssetsPresent(manifest(), assets)).toThrow(
      /PumpOS\.app\.tar\.gz is on the release without its PumpOS\.app\.tar\.gz\.sig/,
    );
  });

  it('fails while GitHub is still processing an upload', () => {
    const assets = COMPLETE.map((a) =>
      a.name === 'PumpOS.app.tar.gz' ? { ...a, state: 'starter' } : a,
    );
    expect(() => assertManifestAssetsPresent(manifest(), assets)).toThrow(
      /is in state "starter", not "uploaded"/,
    );
  });

  it('fails on an empty artifact — a build that failed quietly', () => {
    const assets = COMPLETE.map((a) =>
      a.name === 'PumpOS_1.2.3_x64-setup.exe' ? { ...a, size: 0 } : a,
    );
    expect(() => assertManifestAssetsPresent(manifest(), assets)).toThrow(/is empty/);
  });

  it('allows the universal macOS artifact under both Mac keys', () => {
    // One file, two architectures. This is the shape that was wrongly rejected
    // by a duplicate-count rule.
    const assets = assertManifestAssetsPresent(manifest(), COMPLETE);
    expect(assets.map((a) => a.name)).toEqual(['PumpOS.app.tar.gz', 'PumpOS_1.2.3_x64-setup.exe']);
  });

  it('fails when a key points at a file that cannot serve it', () => {
    const wrong = manifest();
    wrong.platforms['darwin-aarch64'].url = `${BASE}/PumpOS_1.2.3_x64-setup.exe`;
    expect(() => assertManifestAssetsPresent(wrong, COMPLETE)).toThrow(
      /darwin-aarch64 points at PumpOS_1\.2\.3_x64-setup\.exe, which cannot serve that platform/,
    );
  });

  it('inherits the manifest validation, so a malformed manifest never publishes', () => {
    const broken = manifest();
    delete broken.platforms['darwin-aarch64'];
    expect(() => assertManifestAssetsPresent(broken, COMPLETE)).toThrow(
      /missing required target darwin-aarch64/,
    );
  });

  it('reads the asset name out of an encoded URL', () => {
    expect(assetNameFromUrl(`${BASE}/PumpOS%201.2.3.app.tar.gz`)).toBe('PumpOS 1.2.3.app.tar.gz');
  });
});

describe('release asset reachability', () => {
  it('reads one byte of each asset through the authenticated API', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 206 }));
    await assertReleaseAssetsReachable([asset('PumpOS.app.tar.gz')], {
      token: 'secret-token',
      fetchImpl,
      log: () => {},
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${API}/PumpOS.app.tar.gz`);
    // A ranged request: the artifacts are hundreds of megabytes and we only
    // need to know the bytes are there.
    expect(init.headers.range).toBe('bytes=0-0');
    expect(init.headers.accept).toBe('application/octet-stream');
    expect(init.headers.authorization).toBe('Bearer secret-token');
  });

  it('prevents publication when a draft asset cannot be fetched', async () => {
    // This is the case the post-publication smoke check can only report: here
    // it still stops the release.
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }));
    await expect(
      assertReleaseAssetsReachable([asset('PumpOS_1.2.3_x64-setup.exe')], {
        fetchImpl,
        log: () => {},
      }),
    ).rejects.toThrow(/PumpOS_1\.2\.3_x64-setup\.exe is not fetchable \(HTTP 404\)/);
  });

  it('falls back to the browser URL when no API url is present', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 206 }));
    await assertReleaseAssetsReachable(
      [{ name: 'PumpOS.app.tar.gz', url: `${BASE}/PumpOS.app.tar.gz` }],
      { fetchImpl, log: () => {} },
    );
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/PumpOS.app.tar.gz`);
  });
});
