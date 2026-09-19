import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_TARGETS,
  buildUpdaterManifest,
  classifyUpdaterAsset,
  clientLookupKeys,
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
      'darwin-aarch64': { signature: 'bWFjLXNpZw==', url: `${BASE}/PumpOS.app.tar.gz` },
      'darwin-x86_64': { signature: 'bWFjLXNpZw==', url: `${BASE}/PumpOS.app.tar.gz` },
      'windows-x86_64': {
        signature: 'd2luLXNpZw==',
        url: `${BASE}/PumpOS_1.2.3_x64-setup.exe`,
      },
    },
    ...overrides,
  };
}

/**
 * The test that would have caught the v1.3.1 macOS failure.
 *
 * The manifest used to be built from the targets PumpOS *builds*
 * (`darwin-universal`), and every check agreed with that because they all read
 * the same constant. No client ever asks for `darwin-universal`: the plugin
 * builds `{os}-{arch}-{installer}` then `{os}-{arch}` from the machine it runs
 * on (tauri-plugin-updater, `Updater::get_urls`). So the contract under test
 * here is the *client's* lookup, spelled out independently.
 */
describe('every machine PumpOS supports finds an entry', () => {
  const MACHINES = [
    { label: 'Apple Silicon Mac', os: 'darwin', arch: 'aarch64', installer: 'app' },
    { label: 'Intel Mac', os: 'darwin', arch: 'x86_64', installer: 'app' },
    { label: 'Windows x64', os: 'windows', arch: 'x86_64', installer: 'nsis' },
  ];

  it.each(MACHINES)('$label resolves a platform entry', (machine) => {
    const manifest = manifestFixture();
    const keys = clientLookupKeys(machine);
    const found = keys.find((key) => manifest.platforms[key]);
    expect(found, `none of ${keys.join(', ')} is in the manifest`).toBeTruthy();
    expect(manifest.platforms[found].url).toMatch(/^https:\/\//);
  });

  it('exposes exactly the keys those machines ask for, and no build flavours', () => {
    // `darwin-universal` is a build flavour, not a client key. Listing it is
    // what shipped a manifest no Mac could read.
    expect(SUPPORTED_TARGETS).not.toContain('darwin-universal');
    for (const machine of MACHINES) {
      expect(SUPPORTED_TARGETS.some((t) => clientLookupKeys(machine).includes(t))).toBe(true);
    }
  });
});

describe('classifyUpdaterAsset', () => {
  it.each([
    // One universal artifact serves both Mac architectures.
    ['PumpOS.app.tar.gz', ['darwin-aarch64', 'darwin-x86_64']],
    ['PumpOS_1.2.3_x64-setup.exe', ['windows-x86_64']],
    ['PumpOS_1.2.3_x64_en-US.msi', []],
    ['PumpOS_1.2.3_universal.dmg', []],
    // Linux is not built, not listed, and must not sneak in through a glob.
    ['pump-os_1.2.3_amd64.AppImage.tar.gz', []],
  ])('%s -> %s', (name, targets) => {
    expect(classifyUpdaterAsset(name)).toEqual(targets);
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
    expect(assets.map((a) => a.target)).toEqual([
      'darwin-aarch64',
      'darwin-x86_64',
      'windows-x86_64',
    ]);
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
        { target: 'darwin-aarch64', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
        { target: 'darwin-x86_64', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
      ],
    });
    expect(Object.keys(manifest.platforms)).toEqual([
      'darwin-aarch64',
      'darwin-x86_64',
      'windows-x86_64',
    ]);
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
          { target: 'darwin-aarch64', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
          { target: 'darwin-x86_64', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
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
    manifest.platforms['darwin-aarch64'].url = 'http://example.com/PumpOS-1.2.3.app.tar.gz';
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
    manifest.platforms['darwin-aarch64'].signature = 'target/release/bundle/PumpOS.app.tar.gz.sig';
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
    expect(assets.map((a) => a.target)).toEqual([
      'darwin-aarch64',
      'darwin-x86_64',
      'windows-x86_64',
    ]);
    expect(assets[2].url).toBe(`${BASE}/PumpOS_1.2.3_x64-setup.exe`);
  });
});
