import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_TARGETS,
  buildUpdaterManifest,
  classifyUpdaterAsset,
  clientLookupKeys,
  collectUpdaterAssets,
  operatorNotes,
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

/**
 * What a station manager ends up reading.
 *
 * The manifest used to carry GitHub's auto-generated changelog, so the v1.3.2
 * notice showed three commit subjects, two `@handle` mentions and a compare
 * link to a repository the operator has no account for. The contract here is
 * the content one: only the operators section travels, and it travels clean.
 */
describe('operator notes', () => {
  const v132 = readFileSync(
    join(fileURLToPath(new URL('./fixtures/updater/', import.meta.url)), 'release-body-v1.3.2.md'),
    'utf8',
  );

  it('carries the operators section and nothing else from the body', () => {
    const body = [
      "## What's Changed",
      '* fix(updater): thing by @someone in https://github.com/o/r/pull/1',
      '',
      '## For operators',
      'Fuel sales now round to the paise, so the drawer matches the till.',
      '',
      '## Notes for developers',
      'Bumped the Rust toolchain.',
    ].join('\n');
    expect(operatorNotes(body)).toBe(
      'Fuel sales now round to the paise, so the drawer matches the till.',
    );
  });

  it('yields no notes at all when the release has no operators section', () => {
    expect(operatorNotes(v132)).toBe('');
    expect(buildUpdaterManifest({ ...manifestArgs(), notes: operatorNotes(v132) }).notes).toBe('');
  });

  it('still publishes a release whose notes are empty', () => {
    const manifest = buildUpdaterManifest({ ...manifestArgs(), notes: operatorNotes('') });
    expect(() => validateUpdaterManifest(manifest, { version: '1.2.3' })).not.toThrow();
  });

  it.each([
    ['a conventional-commit prefix', 'fix(drawer): cash counts add up', 'cash counts add up'],
    ['a bare prefix', 'feat: nozzle readings prefill', 'nozzle readings prefill'],
    ['a by/in trailer', 'Faster reports by @abdullahnettoor in https://x/y/1', 'Faster reports'],
    ['a bare URL', 'See https://github.com/o/r/pull/9 for detail', 'See for detail'],
    ['a handle mention', 'Thanks @abdullahnettoor for the report', 'Thanks for the report'],
    [
      'emphasis markers',
      '**Important**: restart after the shift',
      'Important: restart after the shift',
    ],
    ['a markdown link', 'Read [the guide](https://docs.example.com) later', 'Read the guide later'],
  ])('strips %s wherever it appears', (_label, written, expected) => {
    expect(operatorNotes(`## For operators\n${written}`)).toBe(expected.trim());
  });

  it('strips a scoped commit prefix mid-sentence, and leaves ordinary prose alone', () => {
    expect(operatorNotes('## For operators\nDetails: fix(drawer): cash counts add up')).toBe(
      'Details: cash counts add up',
    );
    // The bare form mid-sentence is English, not a prefix; eating the verb
    // would be worse than leaving it.
    expect(operatorNotes('## For operators\nWhat we fix: rounding')).toBe('What we fix: rounding');
  });

  it('lets no repository, pull-request or compare URL reach a client', () => {
    const notes = operatorNotes(
      [
        '## For operators',
        '- fix(release): see https://github.com/abdullahnettoor/pumpos/pull/186',
        '- Compare: <https://github.com/abdullahnettoor/pumpos/compare/v1.3.1...v1.3.2>',
        '- Docs at www.pumpos.app/help',
      ].join('\n'),
    );
    expect(notes).not.toMatch(/https?:\/\//);
    expect(notes).not.toMatch(/www\./);
    expect(notes).not.toMatch(/@/);
    expect(notes).toMatch(/^- see/m);
  });

  it('drops changelog furniture written into the section by hand', () => {
    const notes = operatorNotes(
      ['## For operators', 'Drawer rounding is fixed.', '**Full Changelog**: https://x/y'].join(
        '\n',
      ),
    );
    expect(notes).toBe('Drawer rounding is fixed.');
  });

  it('ends the section at the next heading, so a changelog below it never travels', () => {
    const notes = operatorNotes(
      ['## For operators', 'Drawer rounding is fixed.', "## What's Changed", '* fix: thing'].join(
        '\n',
      ),
    );
    expect(notes).toBe('Drawer rounding is fixed.');
  });

  it('treats an empty or whitespace-only section as no notes', () => {
    expect(operatorNotes('## For operators\n\n   \n\n## Next')).toBe('');
    expect(operatorNotes(undefined)).toBe('');
  });

  it('truncates a very long summary rather than emitting an unpublishable manifest', () => {
    const notes = operatorNotes(`## For operators\n${'a'.repeat(9000)}`);
    expect(notes.length).toBeLessThanOrEqual(4001);
    expect(notes.endsWith('…')).toBe(true);
    expect(() =>
      validateUpdaterManifest(buildUpdaterManifest({ ...manifestArgs(), notes }), {
        version: '1.2.3',
      }),
    ).not.toThrow();
  });
});

function manifestArgs() {
  return {
    version: '1.2.3',
    pubDate: '2026-05-01T00:00:00.000Z',
    assets: [
      { target: 'darwin-aarch64', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
      { target: 'darwin-x86_64', name: 'm', signature: 'c2ln', url: `${BASE}/m.app.tar.gz` },
      { target: 'windows-x86_64', name: 'w', signature: 'c2ln', url: `${BASE}/w-setup.exe` },
    ],
  };
}
