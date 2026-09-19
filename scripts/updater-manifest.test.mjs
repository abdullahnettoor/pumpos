import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildUpdaterManifest,
  classifyUpdaterAsset,
  collectUpdaterAssets,
  validateUpdaterManifest,
} from './updater-manifest.mjs';

const BASE = 'https://github.com/abdullahnettoor/pumpos/releases/download/v1.2.3';

function manifestFixture(overrides = {}) {
  return {
    version: '1.2.3',
    notes: 'Fixes drawer reconciliation rounding.',
    pub_date: '2026-05-01T00:00:00.000Z',
    platforms: {
      'darwin-universal': { signature: 'bWFjLXNpZw==', url: `${BASE}/PumpOS.app.tar.gz` },
      'windows-x86_64': {
        signature: 'd2luLXNpZw==',
        url: `${BASE}/PumpOS_1.2.3_x64-setup.exe`,
      },
    },
    ...overrides,
  };
}

describe('classifyUpdaterAsset', () => {
  it.each([
    ['PumpOS.app.tar.gz', 'darwin-universal'],
    ['PumpOS_1.2.3_x64-setup.exe', 'windows-x86_64'],
    ['PumpOS_1.2.3_x64_en-US.msi', null],
    ['PumpOS_1.2.3_universal.dmg', null],
    // Linux is not built, not listed, and must not sneak in through a glob.
    ['pump-os_1.2.3_amd64.AppImage.tar.gz', null],
  ])('%s -> %s', (name, target) => {
    expect(classifyUpdaterAsset(name)).toBe(target);
  });
});

describe('collectUpdaterAssets', () => {
  it('reads signature contents, not signature paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pumpos-manifest-'));
    writeFileSync(join(dir, 'PumpOS.app.tar.gz'), 'mac');
    writeFileSync(join(dir, 'PumpOS.app.tar.gz.sig'), 'bWFjLXNpZw==\n');
    writeFileSync(join(dir, 'PumpOS_1.2.3_x64-setup.exe'), 'win');
    writeFileSync(join(dir, 'PumpOS_1.2.3_x64-setup.exe.sig'), 'd2luLXNpZw==\n');
    writeFileSync(join(dir, 'PumpOS_1.2.3_universal.dmg'), 'dmg');

    const assets = collectUpdaterAssets(dir, BASE);
    expect(assets.map((a) => a.target)).toEqual(['darwin-universal', 'windows-x86_64']);
    expect(assets[0].signature).toBe('bWFjLXNpZw==');
    expect(assets[0].url).toBe(`${BASE}/PumpOS.app.tar.gz`);
  });

  it('fails when an updater artifact was never signed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pumpos-manifest-'));
    writeFileSync(join(dir, 'PumpOS.app.tar.gz'), 'mac');
    expect(() => collectUpdaterAssets(dir, BASE)).toThrow(/has no PumpOS.app.tar.gz.sig/);
  });
});

describe('buildUpdaterManifest', () => {
  it('emits exactly the two supported targets', () => {
    const manifest = buildUpdaterManifest({
      version: '1.2.3',
      notes: 'notes',
      pubDate: '2026-05-01T00:00:00.000Z',
      assets: [
        { target: 'windows-x86_64', name: 'w', signature: 'c2ln', url: `${BASE}/w-setup.exe` },
        { target: 'darwin-universal', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
      ],
    });
    expect(Object.keys(manifest.platforms)).toEqual(['darwin-universal', 'windows-x86_64']);
  });

  it('refuses two artifacts claiming the same target', () => {
    expect(() =>
      buildUpdaterManifest({
        version: '1.2.3',
        assets: [
          { target: 'windows-x86_64', name: 'a', signature: 'c2ln', url: `${BASE}/a-setup.exe` },
          { target: 'windows-x86_64', name: 'b', signature: 'c2ln', url: `${BASE}/b-setup.exe` },
        ],
      }),
    ).toThrow(/two artifacts claim windows-x86_64/);
  });

  it('refuses a manifest missing a supported target', () => {
    expect(() =>
      buildUpdaterManifest({
        version: '1.2.3',
        assets: [
          { target: 'darwin-universal', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
        ],
      }),
    ).toThrow(/missing required target windows-x86_64/);
  });
});

describe('validateUpdaterManifest', () => {
  it('accepts a complete manifest', () => {
    expect(() => validateUpdaterManifest(manifestFixture(), { version: '1.2.3' })).not.toThrow();
  });

  it('fails when the manifest and the tag disagree', () => {
    expect(() => validateUpdaterManifest(manifestFixture(), { version: '1.2.4' })).toThrow(
      /does not match the tag 1\.2\.4/,
    );
  });

  it('fails on a non-HTTPS asset URL', () => {
    const manifest = manifestFixture();
    manifest.platforms['darwin-universal'].url = 'http://example.com/PumpOS-1.2.3.app.tar.gz';
    expect(() => validateUpdaterManifest(manifest)).toThrow(/url must be HTTPS/);
  });

  it('fails when an asset URL points at another version', () => {
    const manifest = manifestFixture();
    manifest.platforms['windows-x86_64'].url =
      'https://github.com/abdullahnettoor/pumpos/releases/download/v1.1.0/PumpOS_1.1.0_x64-setup.exe';
    expect(() => validateUpdaterManifest(manifest)).toThrow(/does not point at v1\.2\.3/);
  });

  it('fails when a signature is a path instead of its contents', () => {
    const manifest = manifestFixture();
    manifest.platforms['darwin-universal'].signature =
      'target/release/bundle/PumpOS.app.tar.gz.sig';
    expect(() => validateUpdaterManifest(manifest)).toThrow(/looks like a file path/);
  });

  it('fails on an unsupported platform entry', () => {
    const manifest = manifestFixture();
    manifest.platforms['linux-x86_64'] = {
      signature: 'c2ln',
      url: `${BASE}/pumpos.AppImage.tar.gz`,
    };
    expect(() => validateUpdaterManifest(manifest)).toThrow(/unsupported target linux-x86_64/);
  });

  it('fails on a non-SemVer version', () => {
    expect(() => validateUpdaterManifest(manifestFixture({ version: 'v1.2.3' }))).toThrow(
      /not a plain X\.Y\.Z SemVer/,
    );
  });
});

describe('collectUpdaterAssets from signatures alone', () => {
  it('builds the asset list from .sig files without the multi-hundred-MB artifacts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pumpos-manifest-'));
    writeFileSync(join(dir, 'PumpOS.app.tar.gz.sig'), 'bWFjLXNpZw==\n');
    writeFileSync(join(dir, 'PumpOS_1.2.3_x64-setup.exe.sig'), 'd2luLXNpZw==\n');

    const assets = collectUpdaterAssets(dir, BASE);
    expect(assets.map((a) => a.target)).toEqual(['darwin-universal', 'windows-x86_64']);
    expect(assets[1].url).toBe(`${BASE}/PumpOS_1.2.3_x64-setup.exe`);
  });
});
