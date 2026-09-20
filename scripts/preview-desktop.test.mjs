import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_IDENTIFIER,
  PREVIEW_PRODUCT_NAME,
  assertPreviewIsolation,
  buildPreviewConfig,
  previewVersion,
} from './preview-desktop.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

const SHA = 'a1b2c3d4e5f6';

describe('preview version', () => {
  it('names the commit it was built from', () => {
    expect(previewVersion('1.3.2', SHA)).toBe('1.3.2-preview.a1b2c3d');
  });

  it('is valid SemVer, with the release as its base and a prerelease suffix', () => {
    // Being a *prerelease* of 1.3.2 is what stops it ever presenting itself as
    // newer than 1.3.2 — SemVer §11. The ordering itself is asserted against
    // the real comparator in apps/desktop/src/updates/version.test.ts, which is
    // the code that actually makes that decision.
    const match = SEMVER.exec(previewVersion('1.3.2', SHA));
    expect(match).not.toBeNull();
    expect(match[1] + '.' + match[2] + '.' + match[3]).toBe('1.3.2');
    expect(match[4]).toBe('preview.a1b2c3d');
  });

  it('accepts a full-length SHA and shortens it', () => {
    expect(previewVersion('1.3.2', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).toBe(
      '1.3.2-preview.a1b2c3d',
    );
  });

  it.each([
    ['1.3', SHA, /not a plain X\.Y\.Z SemVer/],
    ['v1.3.2', SHA, /not a plain X\.Y\.Z SemVer/],
    ['1.3.2', '', /commit SHA/],
    ['1.3.2', 'nope!', /commit SHA/],
  ])('refuses base %s / sha %s rather than building something ambiguous', (base, sha, message) => {
    expect(() => previewVersion(base, sha)).toThrow(message);
  });
});

describe('preview config override', () => {
  const config = () => buildPreviewConfig({ baseVersion: '1.3.2', sha: SHA });

  it('gives the preview its own identity so it installs alongside production', () => {
    expect(config().identifier).toBe(PREVIEW_IDENTIFIER);
    expect(config().productName).toBe(PREVIEW_PRODUCT_NAME);
  });

  it('never carries the production identity', () => {
    const serialised = JSON.stringify(config());
    expect(serialised).not.toContain('"com.pumpos.desktop"');
    expect(serialised).not.toContain('"PumpOS"');
  });

  it('is distinct from the committed production identity', () => {
    // Read the real config rather than restating its values here: if production
    // is ever renamed, this must still be the thing that notices a collision.
    const production = JSON.parse(
      readFileSync(join(ROOT, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
    );
    expect(config().identifier).not.toBe(production.identifier);
    expect(config().productName).not.toBe(production.productName);
  });

  it('carries the preview version', () => {
    expect(config().version).toBe('1.3.2-preview.a1b2c3d');
  });

  it('produces no updater artifacts', () => {
    // A preview build must leave nothing a stable client could ever read.
    expect(config().bundle.createUpdaterArtifacts).toBe(false);
  });

  it('refuses to build a config from a bad version', () => {
    expect(() => buildPreviewConfig({ baseVersion: 'nope', sha: SHA })).toThrow(/SemVer/);
  });
});

describe('preview isolation assertion', () => {
  function bundle(files) {
    const dir = mkdtempSync(join(tmpdir(), 'pumpos-preview-'));
    for (const [name, contents] of Object.entries(files)) {
      const file = join(dir, name);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, contents);
    }
    return dir;
  }

  it('passes for a clean preview bundle', () => {
    const dir = bundle({
      'dmg/PumpOS Preview_1.3.2-preview.a1b2c3d_universal.dmg': 'dmg',
      'macos/PumpOS Preview.app/Contents/Info.plist': 'plist',
    });
    expect(assertPreviewIsolation(dir, { version: '1.3.2-preview.a1b2c3d' })).toBe(true);
  });

  it('fails when the build produced a signature', () => {
    // A signed preview is indistinguishable from a release artifact to anything
    // that finds it later.
    const dir = bundle({ 'macos/PumpOS.app.tar.gz.sig': 'sig' });
    expect(() => assertPreviewIsolation(dir, { version: '1.3.2-preview.a1b2c3d' })).toThrow(
      /signature/i,
    );
  });

  it('fails when the build produced an updater artifact', () => {
    const dir = bundle({ 'macos/PumpOS.app.tar.gz': 'tarball' });
    expect(() => assertPreviewIsolation(dir, { version: '1.3.2-preview.a1b2c3d' })).toThrow(
      /updater artifact/i,
    );
  });

  it('fails when nothing was built at all', () => {
    expect(() => assertPreviewIsolation(bundle({}), { version: '1.3.2-preview.a1b2c3d' })).toThrow(
      /no preview artifacts/i,
    );
  });

  it('fails when the artifacts carry the production identity', () => {
    // The override never applied: this is a production build wearing a preview
    // label, and installing it would replace an operator's real PumpOS.
    const dir = bundle({ 'dmg/PumpOS_1.3.2-preview.a1b2c3d_universal.dmg': 'dmg' });
    expect(() => assertPreviewIsolation(dir, { version: '1.3.2-preview.a1b2c3d' })).toThrow(
      /PumpOS Preview/,
    );
  });

  it('fails when a production-named artifact sits beside a preview one', () => {
    const dir = bundle({
      'dmg/PumpOS Preview_1.3.2-preview.a1b2c3d_universal.dmg': 'dmg',
      'macos/PumpOS.app/Contents/Info.plist': 'plist',
    });
    expect(() => assertPreviewIsolation(dir, { version: '1.3.2-preview.a1b2c3d' })).toThrow(
      /production identity/i,
    );
  });

  it('fails when the artifacts are not preview-versioned', () => {
    // A bundle carrying a release version means the override never applied, and
    // the build is a production build wearing a preview label.
    const dir = bundle({ 'dmg/PumpOS Preview_1.3.2_universal.dmg': 'dmg' });
    expect(() => assertPreviewIsolation(dir, { version: '1.3.2-preview.a1b2c3d' })).toThrow(
      /1\.3\.2-preview\.a1b2c3d/,
    );
  });
});
