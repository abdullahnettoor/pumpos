import { describe, expect, it } from 'vitest';
import { assertManifestAssetsPresent, assetNameFromUrl } from './check-release-assets.mjs';

const BASE = 'https://github.com/abdullahnettoor/pumpos/releases/download/v1.2.3';

function manifest(overrides = {}) {
  return {
    version: '1.2.3',
    notes: '',
    pub_date: '2026-05-01T00:00:00.000Z',
    platforms: {
      'darwin-universal': { signature: 'bWFj', url: `${BASE}/PumpOS.app.tar.gz` },
      'windows-x86_64': { signature: 'd2lu', url: `${BASE}/PumpOS_1.2.3_x64-setup.exe` },
    },
    ...overrides,
  };
}

const COMPLETE = [
  'PumpOS.app.tar.gz',
  'PumpOS.app.tar.gz.sig',
  'PumpOS_1.2.3_universal.dmg',
  'PumpOS_1.2.3_x64-setup.exe',
  'PumpOS_1.2.3_x64-setup.exe.sig',
];

describe('release asset presence', () => {
  it('passes when every referenced asset and its signature are attached', () => {
    expect(assertManifestAssetsPresent(manifest(), COMPLETE)).toBe(true);
  });

  it('fails when a target built but never uploaded', () => {
    const assets = COMPLETE.filter((n) => !n.startsWith('PumpOS_1.2.3_x64-setup.exe'));
    expect(() => assertManifestAssetsPresent(manifest(), assets)).toThrow(
      /windows-x86_64 references PumpOS_1\.2\.3_x64-setup\.exe, which is not attached/,
    );
  });

  it('fails when an asset is attached without its signature', () => {
    const assets = COMPLETE.filter((n) => n !== 'PumpOS.app.tar.gz.sig');
    expect(() => assertManifestAssetsPresent(manifest(), assets)).toThrow(
      /PumpOS\.app\.tar\.gz is on the release without its PumpOS\.app\.tar\.gz\.sig/,
    );
  });

  it('fails when two targets point at one file', () => {
    const duplicated = manifest();
    duplicated.platforms['windows-x86_64'].url = `${BASE}/PumpOS.app.tar.gz`;
    expect(() => assertManifestAssetsPresent(duplicated, COMPLETE)).toThrow(
      /two targets reference the same asset/,
    );
  });

  it('inherits the manifest validation, so a malformed manifest never publishes', () => {
    const broken = manifest();
    delete broken.platforms['darwin-universal'];
    expect(() => assertManifestAssetsPresent(broken, COMPLETE)).toThrow(
      /missing required target darwin-universal/,
    );
  });

  it('reads the asset name out of an encoded URL', () => {
    expect(assetNameFromUrl(`${BASE}/PumpOS%201.2.3.app.tar.gz`)).toBe('PumpOS 1.2.3.app.tar.gz');
  });
});
